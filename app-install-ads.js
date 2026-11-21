(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WishAppInstallAds = api;
    const boot = function () {
      const feed = root.document.getElementById('posts');
      if (feed) api.createController({ feed: feed }).start();
    };
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_PLACEMENT = Object.freeze({ afterPosts: 3, everyPosts: 8, maxAds: 2 });
  const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
  const PREVIEW_CAMPAIGN = Object.freeze({
    id: 'wish-app-ad-preview', enabled: true,
    appName: 'خرائط Google — مثال للمعاينة', advertiser: 'معاينة ويش',
    description: 'مثال لتجربة شكل الإعلان وزر فتح صفحة التطبيق على Google Play.',
    packageId: 'com.google.android.apps.maps',
  });

  function text(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  function googlePlayUrl(packageId) {
    if (typeof packageId !== 'string' || packageId.length > 255 || !PACKAGE_PATTERN.test(packageId)) return null;
    return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(packageId);
  }

  function timestamp(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19) ? parsed : NaN;
  }

  function normaliseCampaign(value, now) {
    if (!value || typeof value !== 'object' || value.enabled !== true) return null;
    const id = text(value.id, 64);
    const appName = text(value.appName, 90);
    const advertiser = text(value.advertiser, 100);
    const url = googlePlayUrl(value.packageId);
    const startsAt = timestamp(value.startsAt);
    const endsAt = timestamp(value.endsAt);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !appName || !advertiser || !url) return null;
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) return null;
    if (startsAt !== null && endsAt !== null && endsAt <= startsAt) return null;
    if ((startsAt !== null && now < startsAt) || (endsAt !== null && now >= endsAt)) return null;
    return { id: id, appName: appName, advertiser: advertiser, description: text(value.description, 240), url: url, endsAt: endsAt, preview: false };
  }

  function bounded(value, fallback, min, max) {
    return Number.isInteger(value) ? Math.max(min, Math.min(value, max)) : fallback;
  }

  function normaliseConfig(value, now) {
    const result = { placement: DEFAULT_PLACEMENT, ads: [] };
    if (!value || value.version !== 1 || value.enabled !== true || !Array.isArray(value.ads)) return result;
    const placement = value.placement || {};
    result.placement = {
      afterPosts: bounded(placement.afterPosts, 3, 3, 12),
      everyPosts: bounded(placement.everyPosts, 8, 6, 30),
      maxAds: bounded(placement.maxAds, 2, 1, 2),
    };
    const seen = new Set();
    value.ads.slice(0, 50).forEach(function (item) {
      const ad = normaliseCampaign(item, now);
      if (ad && !seen.has(ad.id)) { seen.add(ad.id); result.ads.push(ad); }
    });
    return result;
  }

  function positions(postCount, adCount, placement) {
    const indices = [];
    for (let index = placement.afterPosts; index < postCount && indices.length < Math.min(adCount, placement.maxAds); index += placement.everyPosts) indices.push(index);
    return indices;
  }

  function campaignCard(doc, campaign, options) {
    const card = doc.createElement('article');
    card.className = 'feedpost wish-app-ad';
    card.dataset.wishAppAd = campaign.id;
    card.setAttribute('aria-label', 'إعلان تطبيق: ' + campaign.appName);
    function node(tag, className, content, parent) {
      const element = doc.createElement(tag);
      element.className = className;
      if (content !== undefined) element.textContent = content;
      (parent || card).appendChild(element);
      return element;
    }
    const heading = node('div', 'wish-ad-heading');
    node('span', 'wish-ad-badge', campaign.preview ? 'إعلان تجريبي للمعاينة' : 'إعلان', heading);
    node('span', 'wish-ad-store', 'Google Play', heading);
    const body = node('div', 'wish-ad-body');
    const icon = node('div', 'wish-ad-icon', '📱', body);
    icon.setAttribute('aria-hidden', 'true');
    node('h2', 'wish-ad-title', campaign.appName, body);
    node('p', 'wish-ad-sponsor', 'المعلن: ' + campaign.advertiser, body);
    if (campaign.description) node('p', 'wish-ad-description', campaign.description, body);
    if (campaign.preview) node('p', 'wish-ad-preview', 'مثال توضيحي غير مدفوع؛ لا يمثل حملة إعلانية فعلية ولا يسجّل تثبيتًا أو أرباحًا.');
    const actions = node('div', 'wish-ad-actions');
    const install = node('a', 'wish-ad-install', 'تثبيت', actions);
    install.href = campaign.url;
    install.target = '_blank';
    install.rel = 'noopener noreferrer sponsored';
    install.referrerPolicy = 'no-referrer';
    install.setAttribute('aria-label', 'فتح ' + campaign.appName + ' على Google Play');
    install.addEventListener('click', function (event) {
      if (campaign.endsAt !== null && options.now() >= campaign.endsAt) {
        event.preventDefault();
        options.refresh();
      }
    });
    node('p', 'wish-ad-note', 'يفتح صفحة التطبيق على Google Play عند الضغط.', actions);
    const skip = node('button', 'wish-ad-skip', 'متابعة المقاطع', actions);
    skip.type = 'button';
    skip.addEventListener('click', function () {
      const next = card.nextElementSibling;
      if (next && typeof next.scrollIntoView === 'function') next.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return card;
  }

  function createController(options) {
    const feed = options.feed;
    const doc = feed.ownerDocument;
    const view = doc.defaultView;
    const now = options.now || Date.now;
    const fetchConfig = options.fetch || (view.fetch && view.fetch.bind(view));
    const pageUrl = options.pageUrl || view.location.href;
    const preview = new URL(pageUrl).searchParams.get('wish_ads_preview') === '1';
    let raw = null;
    let observer = null;
    let timer = null;
    let started = false;
    let stopped = false;

    function schedule() {
      if (timer !== null) view.clearTimeout(timer);
      timer = null;
      if (preview || !raw || raw.enabled !== true || !Array.isArray(raw.ads)) return;
      const time = now();
      const boundaries = raw.ads.slice(0, 50).filter(function (ad) { return ad && ad.enabled === true; }).flatMap(function (ad) { return [timestamp(ad.startsAt), timestamp(ad.endsAt)]; }).filter(function (value) { return value !== null && Number.isFinite(value) && value > time; });
      if (boundaries.length) timer = view.setTimeout(refresh, Math.min(Math.min.apply(null, boundaries) - time, 2147483647));
    }

    function refresh() {
      if (stopped) return;
      Array.from(feed.children).filter(function (node) { return node.hasAttribute('data-wish-app-ad'); }).forEach(function (node) { node.remove(); });
      const posts = Array.from(feed.children).filter(function (node) { return node.classList.contains('feedpost'); });
      const config = normaliseConfig(raw, now());
      if (preview) {
        const example = normaliseCampaign(PREVIEW_CAMPAIGN, now());
        example.preview = true;
        config.ads = [example];
        config.placement = DEFAULT_PLACEMENT;
      }
      positions(posts.length, config.ads.length, config.placement).forEach(function (index, adIndex) {
        const card = campaignCard(doc, config.ads[adIndex], { now: now, refresh: refresh });
        posts[index - 1].after(card);
      });
      schedule();
    }

    async function load() {
      try {
        if (!fetchConfig) return;
        const url = new URL(options.configUrl || './app-install-ads.json', pageUrl);
        if (url.origin !== new URL(pageUrl).origin) return;
        const response = await fetchConfig(url.href, { credentials: 'omit', cache: 'no-cache', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Ad configuration unavailable');
        raw = await response.json();
      } catch (_) {
        raw = null;
      } finally {
        refresh();
      }
    }

    function start() {
      if (started || stopped) return Promise.resolve();
      started = true;
      if (typeof view.MutationObserver === 'function') {
        observer = new view.MutationObserver(function (records) {
          const changedPosts = records.some(function (record) {
            return Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(function (node) {
              return node.nodeType === 1 && node.classList.contains('feedpost') && !node.hasAttribute('data-wish-app-ad');
            });
          });
          if (changedPosts) refresh();
        });
        observer.observe(feed, { childList: true });
      }
      refresh();
      return load();
    }

    function stop() {
      stopped = true;
      if (observer) observer.disconnect();
      if (timer !== null) view.clearTimeout(timer);
      Array.from(feed.children).filter(function (node) { return node.hasAttribute('data-wish-app-ad'); }).forEach(function (node) { node.remove(); });
    }

    return { start: start, refresh: refresh, stop: stop };
  }

  return Object.freeze({ googlePlayUrl: googlePlayUrl, normaliseConfig: normaliseConfig, positions: positions, createController: createController });
});
