import {
  // buildBlock,
  loadHeader,
  loadFooter,
  decorateIcon,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  sampleRUM,
} from './aem.js';

/**
 * Loads fonts.css and sets a session storage flag to enable early font loading.
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Checks if an SVG uses currentcolor for dynamic color inheritance.
 * @param {SVGElement} svg SVG element
 * @returns {boolean} `true` if SVG uses currentcolor
 */
function usesCurrentColor(svg) {
  const styleEl = svg.querySelector('style');
  const inStyle = styleEl && styleEl.textContent.toLowerCase().includes('currentcolor');
  const fills = svg.querySelectorAll('[fill]');
  const inFill = [...fills].some((f) => f.getAttribute('fill').toLowerCase() === 'currentcolor');
  const strokes = svg.querySelectorAll('[stroke]');
  const inStroke = [...strokes].some((s) => s.getAttribute('stroke').toLowerCase() === 'currentcolor');
  return inStyle || inFill || inStroke;
}

/**
 * Fetches SVG content from a URL.
 * @param {string} src URL of SVG icon
 * @returns {Promise<string>} SVG markup
 */
function fetchIcon(src) {
  window.hlx.icons = window.hlx.icons || new Map();
  if (!window.hlx.icons.has(src)) {
    window.hlx.icons.set(src, fetch(src).then((resp) => resp.text()));
  }
  return window.hlx.icons.get(src);
}

/**
 * Swaps an icon image with its inline SVG.
 * @param {HTMLImageElement} icon Icon image
 */
async function swapIcon(icon) {
  const svgText = await fetchIcon(icon.src);
  const temp = document.createElement('div');
  temp.innerHTML = svgText;
  const svg = temp.querySelector('svg');
  temp.remove();
  if (usesCurrentColor(svg)) {
    const altText = icon.alt;
    if (altText) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', altText);
    }
    icon.replaceWith(svg);
  }
}

/**
 * Returns the shared icon observer (creating it if needed).
 * @returns {IntersectionObserver} Shared observer for lazy icon swapping
 */
function getIconObserver() {
  if (!window.hlx.iconObserver) {
    window.hlx.iconObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          window.hlx.iconObserver.unobserve(entry.target);
          swapIcon(entry.target);
        }
      });
    }, { threshold: 0 });
  }
  return window.hlx.iconObserver;
}

/**
 * Observes icon images and replaces them with inline SVGs when they enter the viewport.
 * @param {Element|Document} [container] Container to search for icons
 */
export function swapIcons(container = document) {
  const observer = getIconObserver();
  container.querySelectorAll('span.icon > img[src]:not([data-checked])').forEach((img) => {
    img.dataset.checked = true;
    observer.observe(img);
  });
}

/**
 * Creates a span.icon element and registers it for SVG swapping.
 * @param {string} name Icon name (used in class `icon-{name}`)
 * @param {string} [modifier] Optional modifier class
 * @returns {HTMLSpanElement} Decorated icon span
 */
export function buildIcon(name, modifier) {
  const icon = document.createElement('span');
  icon.className = `icon icon-${name}`;
  if (modifier) icon.classList.add(modifier);
  decorateIcon(icon);
  const img = icon.querySelector('img');
  if (img) {
    img.dataset.checked = true;
    getIconObserver().observe(img);
  }
  return icon;
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  const fragments = main.querySelectorAll('a[href*="/fragments/"]');
  if (fragments.length > 0) {
    // eslint-disable-next-line import/no-cycle
    import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
      Promise.all([...fragments].map(async (fragment) => {
        try {
          const { pathname } = new URL(fragment.href);
          const frag = await loadFragment(pathname);
          fragment.parentElement.replaceWith(frag.firstElementChild);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Fragment loading failed', error);
        }
      }));
    });
  }
}

/**
 * Decorates standalone links as buttons.
 * @param {Element} main Main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    // identify standalone links
    if (a.href !== a.textContent && p.textContent.trim() === a.textContent.trim()) {
      a.className = 'button';
      const strong = a.closest('strong');
      const em = a.closest('em');
      const double = strong && em;
      if (double) a.classList.add('accent');
      else if (strong) a.classList.add('emphasis');
      else if (em) a.classList.add('outline');
      p.replaceChild(a, p.firstChild);
      p.className = 'button-wrapper';
    }
  });

  // collapse adjacent button wrappers
  const wrappers = main.querySelectorAll('p.button-wrapper');
  let previousWrapper = null;
  wrappers.forEach((wrapper) => {
    if (previousWrapper && previousWrapper.nextElementSibling === wrapper) {
      // move all buttons from the current wrapper to the previous wrapper
      previousWrapper.append(...wrapper.childNodes);
      // remove the empty wrapper
      wrapper.remove();
    } else previousWrapper = wrapper; // now set the current wrapper as the previous wrapper
  });
}

/**
 * Wraps paragraph images with `.img-wrapper` for styling hooks.
 */
function decorateImages(main) {
  main.querySelectorAll('p img').forEach((img) => {
    const p = img.closest('p');
    p.className = 'img-wrapper';
  });
}

/**
 * Decorates the main element.
 * @param {Element} main Main element
 */
export function decorateMain(main) {
  decorateIcons(main);
  decorateImages(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc Document element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  sampleRUM.enhance();

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc Document element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
  swapIcons(main);
}

/**
 * Loads everything that happens a lot later without impacting UX.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

/**
 * Orchestrates page loading in phases.
 */
async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
