/* 组件面板 —— 在 Pages 菜单旁注入一个「组件」入口
 * 缩略图是真实渲染（迷你 dc runtime 跑在 blob iframe 里），不是截图、不是示意图。
 * 数据来源：project/canvas.json 里「组件」页的板 → project/*.dc.html
 * 取用语义：拖拽/点击落地的是「默认值展开后的独立副本」（样式速取），
 * 内容与组件定义解耦，文字、枚举值等都可在画布上直接改。
 */
(function () {
  'use strict';
  if (window.__DC_KIT_PANEL__) return;
  window.__DC_KIT_PANEL__ = true;

  // ---------------------------------------------------------------- 基础
  const M = /^\/design\/([^/]+)\//.exec(location.pathname);
  if (!M) return;
  const BASE = `/design/${M[1]}/`;

  // 网页名称统一为 Yayi Design，并防止编辑器运行时把它改回默认值
  const SITE_TITLE = 'Yayi Design';
  const enforceTitle = () => {
    if (document.title !== SITE_TITLE) document.title = SITE_TITLE;
  };
  enforceTitle();
  const titleTimer = setInterval(enforceTitle, 800);
  const titleMO = new MutationObserver(enforceTitle);
  titleMO.observe(document.head, { childList: true, subtree: true, characterData: true });
  setTimeout(() => {
    clearInterval(titleTimer);
    try { titleMO.disconnect(); } catch (e) {}
  }, 30000);

  // 统一线性 SVG 图标（与编辑器工具栏风格一致），避免 emoji
  const ICON = {
    menu: '<svg viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    rename: '<svg viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10L11 2.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.5 4l2.5 2.5" stroke="currentColor" stroke-width="1.2"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v4M9.2 7v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    caret: '<svg viewBox="0 0 16 16" fill="none"><path d="M5 3l6 5-6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    page: '<svg viewBox="0 0 16 16" fill="none"><rect x="3.5" y="2.5" width="9" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    drag: '<svg viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="4" r="1.1" fill="currentColor"/><circle cx="10.5" cy="4" r="1.1" fill="currentColor"/><circle cx="5.5" cy="8" r="1.1" fill="currentColor"/><circle cx="10.5" cy="8" r="1.1" fill="currentColor"/><circle cx="5.5" cy="12" r="1.1" fill="currentColor"/><circle cx="10.5" cy="12" r="1.1" fill="currentColor"/></svg>'
  };

  const cache = new Map();
  async function getText(p) {
    if (cache.has(p)) return cache.get(p);
    let t = null;
    try {
      const r = await fetch(BASE + p, { cache: 'no-store' });
      if (r.ok) t = await r.text();
    } catch (e) {
      t = null;
    }
    cache.set(p, t);
    return t;
  }

  // ------------------------------------------------- dc 组件文件解析
  function parseComponent(src) {
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const xdc = doc.querySelector('x-dc') || doc.body;
    const style = Array.from(doc.querySelectorAll('helmet style, style'))
      .map((s) => s.textContent || '')
      .join('\n');
    const scriptEl = doc.querySelector('script[data-dc-script]');
    let meta = {};
    let code = '';
    if (scriptEl) {
      try {
        meta = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      } catch (e) {
        meta = {};
      }
      code = scriptEl.textContent || '';
    }
    const clone = xdc.cloneNode(true);
    clone.querySelectorAll('helmet, script').forEach((n) => n.remove());
    const tpl = clone.innerHTML;
    const pv = meta.$preview || {};
    const defaults = {};
    for (const k of Object.keys(meta)) {
      if (k === '$preview') continue;
      const d = meta[k] && meta[k].default;
      if (d !== undefined) defaults[k] = d;
    }
    return {
      style,
      tpl,
      code,
      defaults,
      meta,
      w: Number(pv.width) || 320,
      h: Number(pv.height) || 240,
      title: doc.title || ''
    };
  }

  // --------------------------------------------- iframe 内的迷你运行时
  function KIT_RUNTIME(SOURCES, ENTRY, ENTRY_PROPS) {
    var binds = [];
    var seq = 0;
    var scheduled = false;
    var instances = {};
    var VOID = { br: 1, img: 1, input: 1, hr: 1, meta: 1, link: 1, path: 1, circle: 1, rect: 1, line: 1, polyline: 1, polygon: 1, use: 1, stop: 1, ellipse: 1, source: 1, area: 1, col: 1 };

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escAttr(s) {
      return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
    function evalExpr(expr, scope) {
      try {
        return new Function('__s', 'with(__s){return (' + expr + ')}')(scope);
      } catch (e) {
        return undefined;
      }
    }
    function interp(str, scope) {
      return String(str).replace(/\{\{([\s\S]*?)\}\}/g, function (_, e) {
        var v = evalExpr(e, scope);
        return v == null ? '' : String(v);
      });
    }
    function pureExpr(str) {
      if (str == null) return null;
      var m = /^\s*\{\{([\s\S]*?)\}\}\s*$/.exec(str);
      return m ? m[1] : null;
    }
    function camel(s) {
      return s.replace(/-([a-z])/g, function (_, c) {
        return c.toUpperCase();
      });
    }

    function DCLogic() {
      this.state = {};
    }
    DCLogic.prototype.setState = function (patch) {
      this.state = Object.assign({}, this.state, patch);
      schedule();
    };

    function instanceOf(name) {
      if (instances[name]) return instances[name];
      var src = SOURCES[name];
      var inst = null;
      if (src && src.code) {
        try {
          var C = new Function('DCLogic', src.code + '\n;return (typeof Component!=="undefined")?Component:null;')(DCLogic);
          if (C) inst = new C();
        } catch (e) {
          console.warn('[kit] ' + name + ':', e && e.message);
        }
      }
      if (!inst) inst = new DCLogic();
      instances[name] = inst;
      return inst;
    }

    function scopeOf(name, props) {
      var inst = instanceOf(name);
      inst.props = props || {};
      var vals = {};
      if (typeof inst.renderVals === 'function') {
        try {
          vals = inst.renderVals() || {};
        } catch (e) {
          console.warn('[kit] renderVals ' + name + ':', e && e.message);
        }
      }
      return Object.assign({}, props || {}, inst.state || {}, vals);
    }

    function renderNodes(nodes, scope) {
      var out = '';
      for (var i = 0; i < nodes.length; i++) out += renderNode(nodes[i], scope);
      return out;
    }

    function renderNode(node, scope) {
      if (node.nodeType === 3) {
        var txt = node.nodeValue;
        return txt.indexOf('{{') >= 0 ? esc(interp(txt, scope)) : txt;
      }
      if (node.nodeType !== 1) return '';
      var tag = node.tagName.toLowerCase();
      if (tag === 'helmet' || tag === 'script' || tag === 'x-dc') return renderNodes(node.childNodes, scope);

      if (tag === 'sc-if') {
        var e1 = pureExpr(node.getAttribute('value'));
        var val = e1 !== null ? evalExpr(e1, scope) : interp(node.getAttribute('value') || '', scope);
        return val ? renderNodes(node.childNodes, scope) : '';
      }
      if (tag === 'sc-for') {
        var e2 = pureExpr(node.getAttribute('list'));
        var list = e2 !== null ? evalExpr(e2, scope) : [];
        if (!Array.isArray(list)) list = list == null ? [] : [list];
        var as = node.getAttribute('as') || 'item';
        var buf = '';
        for (var i = 0; i < list.length; i++) {
          var s2 = Object.create(scope);
          s2[as] = list[i];
          buf += renderNodes(node.childNodes, s2);
        }
        return buf;
      }
      if (tag === 'dc-import') {
        var nm = node.getAttribute('name');
        var props = {};
        for (var a = 0; a < node.attributes.length; a++) {
          var at = node.attributes[a];
          if (/^hint-/.test(at.name)) continue;
          var pe = pureExpr(at.value);
          props[camel(at.name)] = pe !== null ? evalExpr(pe, scope) : interp(at.value, scope);
        }
        return renderComponent(nm, props);
      }

      var attrs = '';
      for (var k = 0; k < node.attributes.length; k++) {
        var at2 = node.attributes[k];
        var an = at2.name;
        var av = at2.value;
        if (/^hint-/.test(an)) continue;
        var pe2 = pureExpr(av);
        if (/^on/.test(an) && pe2 !== null) {
          var fn = evalExpr(pe2, scope);
          if (typeof fn === 'function') {
            var id = 'kb' + ++seq;
            binds.push([id, an.slice(2).toLowerCase(), fn]);
            attrs += ' data-' + id + '="1"';
          }
          continue;
        }
        if (pe2 !== null) {
          var vv = evalExpr(pe2, scope);
          if (vv === true) {
            attrs += ' ' + an;
            continue;
          }
          if (vv === false || vv == null) continue;
          attrs += ' ' + an + '="' + escAttr(String(vv)) + '"';
          continue;
        }
        if (av.indexOf('{{') >= 0) av = interp(av, scope);
        attrs += ' ' + an + '="' + escAttr(av) + '"';
      }
      if (VOID[tag]) return '<' + tag + attrs + '>';
      return '<' + tag + attrs + '>' + renderNodes(node.childNodes, scope) + '</' + tag + '>';
    }

    var parsed = {};
    function templateOf(name) {
      if (parsed[name]) return parsed[name];
      var src = SOURCES[name];
      if (!src) return null;
      var doc = new DOMParser().parseFromString('<div id="__hold">' + src.tpl + '</div>', 'text/html');
      var holder = doc.getElementById('__hold');
      parsed[name] = holder;
      return holder;
    }

    function renderComponent(name, props) {
      var src = SOURCES[name];
      if (!src) return '<span style="color:#c62828">缺少组件 ' + esc(name) + '</span>';
      var holder = templateOf(name);
      if (!holder) return '';
      var merged = Object.assign({}, src.defaults || {}, props || {});
      return renderNodes(holder.childNodes, scopeOf(name, merged));
    }

    function bindAll(root) {
      for (var i = 0; i < binds.length; i++) {
        var b = binds[i];
        var el = root.querySelector('[data-' + b[0] + ']');
        if (el) el.addEventListener(b[1], b[2]);
      }
      binds = [];
    }

    function render() {
      binds = [];
      var root = document.getElementById('__k');
      if (!root) return;
      var html = '';
      try {
        html = renderComponent(ENTRY, ENTRY_PROPS);
      } catch (err) {
        root.innerHTML = '<pre style="margin:0;padding:8px;font:11px/1.45 ui-monospace,monospace;color:#c62828;white-space:pre-wrap">' +
          'kit: ' + String((err && err.stack) || err).slice(0, 400) + '</pre>';
        return;
      }
      if (!html.trim()) {
        root.innerHTML = '<div style="padding:10px;font:11px/1.5 ui-monospace,monospace;color:#8C939E">(该组件在当前默认值下没有可视内容)</div>';
        return;
      }
      root.innerHTML = html;
      bindAll(root);
      try {
        parent.postMessage({ __kit: 'size', name: ENTRY, w: document.body.scrollWidth, h: document.body.scrollHeight }, '*');
      } catch (e) {}
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        render();
      }, 0);
    }

    window.addEventListener('error', function (e) {
      console.warn('[kit] runtime error', e && e.message);
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
  }

  // ------------------------------------------------------------ 预览文档
  function buildDoc(sources, entry, props, transparentBg) {
    const style = Object.keys(sources)
      .map((k) => sources[k].style || '')
      .join('\n');
    const runtime = `(${KIT_RUNTIME.toString()})(${JSON.stringify(sources)},${JSON.stringify(entry)},${JSON.stringify(props || {})});`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:${transparentBg ? 'transparent' : '#fff'}}
body{overflow:hidden}
${style}
</style></head><body><div id="__k"></div><script>${runtime}<\/script></body></html>`;
  }

  function mountFrame(srcDoc, w, h, onSized) {
    const f = document.createElement('iframe');
    f.setAttribute('scrolling', 'no');
    // 关键：缩略图/详情预览是纯展示，iframe 内部会吞掉鼠标事件，
    // 导致拖拽不跟手、难触发。设 pointer-events:none 让拖拽落到卡片本身。
    f.style.cssText = `width:${w}px;height:${h}px;border:0;display:block;background:transparent;pointer-events:none`;
    const url = URL.createObjectURL(new Blob([srcDoc], { type: 'text/html' }));
    f.src = url;
    f.addEventListener('load', () => {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setTimeout(() => {
        if (!onSized) return;
        try {
          const d = f.contentDocument;
          if (!d || !d.body || !d.getElementById('__k')) return;
          const rw = Math.max(16, Math.min(Math.round(d.body.scrollWidth) || w, w));
          const rh = Math.max(16, Math.min(Math.round(d.body.scrollHeight) || h, h));
          onSized(rw, rh, f);
        } catch (e) {}
      }, 220);
    });
    return f;
  }

  // --------------------------------------------------------------- 数据
  let DATA = { items: [], kitName: '', error: '' };

  async function loadData() {
    const canvas = JSON.parse((await getText('project/canvas.json')) || 'null');
    if (!canvas) return { items: [], error: '读不到 project/canvas.json' };
    const pages = canvas.pages || [];
    const kit = pages.find((p) => /组件|component|kit/i.test(`${p.name || ''} ${p.id || ''}`));
    const boards = canvas.boards || {};
    const names = Object.keys(boards).filter((f) => !kit || boards[f].page === kit.id);

    const items = [];
    const sources = {};
    for (const f of names) {
      const src = await getText('project/' + f);
      if (!src) continue;
      const key = f.replace(/\.dc\.html$/i, '');
      const c = parseComponent(src);
      sources[key] = { tpl: c.tpl, style: c.style, code: c.code, defaults: c.defaults };
      items.push({
        key,
        file: f,
        label: boards[f].title || key,
        title: c.title,
        w: c.w,
        h: c.h,
        meta: c.meta,
        defaults: c.defaults,
        // 模板（如「全局侧边菜单」）：以 dc-import 引用落地，改模板全局生效；
        // 其余组件按「样式速取」落地为独立副本。
        tpl: /全局|模板|template/i.test(boards[f].title || '')
      });
    }
    return { items, sources, kitName: kit ? kit.name : '组件', error: '' };
  }

  // --------------------------------------------------------------- 样式
  const CSS = `
.__kit-btn{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;margin-left:6px;border:1px solid #DDE1E8;border-radius:6px;background:#fff;color:#3A4048;font:500 12px/1 -apple-system,BlinkMacSystemFont,'PingFang SC',system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.__kit-btn:hover{background:#F4F6F9;border-color:#C9D0DA}
.__kit-btn b{color:#2a78d6;font-weight:600}
/* ---------- 顶部左上角弹出面板 ---------- */
.__kit-panel{position:fixed;left:12px;top:52px;z-index:2147483000;width:300px;height:min(560px,72vh);display:flex;flex-direction:column;background:#fff;border:1px solid #E4E8EE;border-radius:10px;box-shadow:0 12px 40px rgba(16,18,22,.16),0 2px 8px rgba(16,18,22,.08);opacity:0;transform:translateY(-6px) scale(.985);transform-origin:12px 0;pointer-events:none;transition:opacity .16s ease,transform .16s ease;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.__kit-panel.on{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
.__kit-tabs{display:flex;align-items:center;gap:22px;height:54px;padding:0 16px;flex:0 0 auto;border-bottom:1px solid #EDEFF3}
.__kit-tab{border:0;background:none;padding:0;height:54px;font:400 14px/1 inherit;color:#8C939E;cursor:pointer;position:relative;white-space:nowrap}
.__kit-tab:hover{color:#3A4048}
.__kit-tab.on{color:#2a78d6;font-weight:600}
.__kit-tab.on::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#2a78d6;border-radius:2px 2px 0 0}
.__kit-x{margin-left:auto;width:26px;height:26px;flex:0 0 auto;border:0;border-radius:6px;background:none;color:#8C939E;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.__kit-x svg{width:12px;height:12px;display:block}
.__kit-x:hover{background:#F4F6F9;color:#3A4048}
.__kit-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.__kit-view{flex:1;min-height:0;overflow-y:auto;padding:12px 12px 16px}
.__kit-view[hidden]{display:none}
.__kit-page-search{margin:0 0 8px;display:flex;align-items:center;height:30px;border:1px solid #E3E7ED;border-radius:6px;background:#FBFCFD;transition:border-color .12s,background .12s}
.__kit-page-search:focus-within{border-color:#2a78d6;background:#fff}
.__kit-page-search .ico{flex:0 0 auto;width:26px;display:flex;align-items:center;justify-content:center;color:#B1B7C1}
.__kit-page-search .ico svg{width:12px;height:12px;display:block}
.__kit-page-search input{flex:1;min-width:0;height:28px;padding:0 8px 0 0;border:0;background:none;font:400 12px/1 inherit;color:#3A4048;outline:none;box-sizing:border-box}
.__kit-page-search input::placeholder{color:#B1B7C1}
.__kit-page-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;color:#9AA1AC;font-size:11px;line-height:1.4}
.__kit-page-help button{flex:0 0 auto;border:0;background:none;color:#7C8490;font-size:11px;cursor:pointer;padding:2px 0}
.__kit-page-help button:hover{color:#2a78d6}
.__kit-pages{display:flex;flex-direction:column;gap:2px}
.__kit-page-op{flex:0 0 auto;display:flex;align-items:center;gap:2px;opacity:0;transition:opacity .12s}
.__kit-page:hover .__kit-page-op{opacity:1}
.__kit-page-op button{width:20px;height:20px;border:0;background:none;border-radius:4px;color:#8C939E;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.__kit-page-op button:hover{background:#E9EDF3;color:#2a78d6}
.__kit-page-op button.del:hover{background:#fbeeec;color:#c62828}
.__kit-page-op button svg{width:12px;height:12px;display:block}
.__kit-drag{width:14px;height:24px;display:flex;align-items:center;justify-content:center;color:#B1B7C1;cursor:grab;flex:0 0 auto;opacity:0;transition:opacity .12s}
.__kit-drag svg{width:10px;height:10px;display:block}
.__kit-page:hover .__kit-drag{opacity:1}
.__kit-drag:active{cursor:grabbing}
.__kit-caret{width:16px;height:20px;flex:0 0 auto;border:0;background:none;color:#9AA1AC;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;padding:0;transition:transform .14s,color .12s;transform:rotate(90deg)}
.__kit-caret svg{width:10px;height:10px;display:block}
.__kit-page.collapsed>.row .__kit-caret{transform:rotate(0deg)}
.__kit-caret:hover{color:#2a78d6;background:#EEF2F8}
.__kit-caret.leaf{visibility:hidden;pointer-events:none}
.__kit-page{display:block}
.__kit-page>.row{display:flex;align-items:center;gap:6px;min-height:32px;padding:0 8px 0 4px;border-radius:6px;cursor:pointer;position:relative}
.__kit-page>.row:hover{background:#F5F7FA}
.__kit-page.on>.row{background:#e6f0fa}
.__kit-page.on>.row .__kit-name{color:#2a78d6;font-weight:600}
.__kit-page .__kit-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;font:400 13px/1 inherit;color:#3A4048}
.__kit-page .__kit-name mark{background:#FCE49A;color:#7A4A00;padding:0 1px;border-radius:2px}
.__kit-page .__kit-rename-input{min-width:0;flex:1 1 auto;height:24px;padding:0 6px;border:1px solid #2a78d6;border-radius:4px;font:400 13px/1 inherit;color:#3A4048;outline:none;box-sizing:border-box}
.__kit-page.dragging>.row{opacity:.42}
.__kit-page .__kit-count{flex:0 0 auto;font-size:10px;color:#A8AEB8;font-weight:400}
.__kit-dot{display:none}
.__kit-page.drop-before>.row::before,.__kit-page.drop-after>.row::after{content:'';position:absolute;left:6px;right:6px;height:2px;background:#2a78d6;border-radius:2px;pointer-events:none;z-index:2}
.__kit-page.drop-before>.row::before{top:-1px}
.__kit-page.drop-after>.row::after{bottom:-1px}
.__kit-page.drop-child>.row{background:#eaf2fb;box-shadow:inset 0 0 0 1px #cadcf5}
.__kit-new{width:100%;height:32px;margin-top:12px;border:1px dashed #D9DEE6;border-radius:7px;background:none;color:#8C939E;font:400 12px/1 inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}
.__kit-new svg{width:11px;height:11px;display:block}
.__kit-new:hover{border-color:#2a78d6;color:#2a78d6;background:#f4f8fd}
.__kit-grip{display:none}
.__kit-handle{position:fixed;left:12px;top:12px;z-index:2147482999;width:32px;height:32px;border:1px solid #E1E5EB;border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(16,18,22,.06);color:#5C636D;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background .12s,border-color .12s,color .12s}
.__kit-handle:hover{background:#F4F6F9;color:#2a78d6;border-color:#d0e1f6}
.__kit-handle.on{background:#e6f0fa;color:#2a78d6;border-color:#cadcf5}
.__kit-handle svg{width:16px;height:16px;display:block}
/* 嵌入编辑器工具栏时：随图标排列，不再浮在图标上 */
.__kit-handle.in-toolbar{position:static;left:auto;top:auto;width:24px;height:24px;border:0;border-radius:5px;background:transparent;box-shadow:none;color:#141413;flex:0 0 auto;margin:0 4px 0 0;padding:0}
.__kit-handle.in-toolbar svg{width:15px;height:15px}
.__kit-handle.in-toolbar:hover{background:#ededeb;color:#141413}
.__kit-handle.in-toolbar.on{background:#dfebf9;color:#2a78d6}
.__kit-grid{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;display:flex;flex-direction:column;gap:8px}
.__kit-card{border:1px solid #E6E9EE;border-radius:8px;overflow:hidden;background:#fff;cursor:pointer;transition:border-color .14s,box-shadow .14s;display:flex;align-items:center;gap:12px;padding:8px 10px}
.__kit-card:hover{border-color:#2a78d6;box-shadow:0 4px 14px rgba(42,120,214,.12)}
.__kit-thumb{flex:0 0 auto;height:38px;width:76px;display:flex;align-items:center;justify-content:center;background:#F7F8FA;border:1px solid #EEF0F4;overflow:hidden;position:relative;border-radius:5px;box-sizing:border-box}
.__kit-thumb .clip{transform-origin:center center;display:flex;align-items:center;justify-content:center}
.__kit-meta{flex:1;min-width:0}
.__kit-meta b{display:block;font-size:13px;font-weight:600;color:#1B2028;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.__kit-meta i{display:block;font-style:normal;font-size:11px;color:#8C939E;margin-top:3px}
.__kit-detail{display:none;flex-direction:column;background:#FBFCFD;flex:1;min-height:0;min-width:0}
.__kit-body.detail .__kit-grid{display:none}
.__kit-detail.on{display:flex}
.__kit-dstage{flex:1;overflow:auto;padding:22px;display:flex;align-items:center;justify-content:center;background:
  linear-gradient(45deg,#F1F3F6 25%,transparent 25%,transparent 75%,#F1F3F6 75%),
  linear-gradient(45deg,#F1F3F6 25%,transparent 25%,transparent 75%,#F1F3F6 75%);
  background-size:16px 16px;background-position:0 0,8px 8px}
.__kit-dfoot{padding:12px;border-top:1px solid #EDEFF3;background:#fff}
.__kit-dfoot textarea{width:100%;box-sizing:border-box;height:64px;border:1px solid #E1E5EB;border-radius:8px;padding:8px 9px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#2A3038;resize:none;background:#F9FAFB}
.__kit-dfoot .row{display:flex;gap:8px;margin-top:8px;align-items:center}
.__kit-dfoot .row button{height:28px;padding:0 12px;border-radius:7px;border:1px solid #DDE1E8;background:#fff;font-size:12px;color:#3A4048;cursor:pointer}
.__kit-dfoot .row button.pri{background:#2a78d6;border-color:#2a78d6;color:#fff;font-weight:500}
.__kit-dfoot .row button:hover{filter:brightness(.97)}
.__kit-empty{padding:44px 20px;text-align:center;color:#8C939E;font-size:13px;line-height:1.7}
.__kit-card{position:relative}
.__kit-add{flex:0 0 auto;width:26px;height:26px;padding:0;border:1px solid #2a78d6;border-radius:6px;background:#2a78d6;color:#fff;font:600 14px/1 -apple-system,system-ui,sans-serif;cursor:pointer;opacity:0;transition:opacity .12s;z-index:3;white-space:nowrap}
.__kit-card:hover .__kit-add{opacity:1}
.__kit-add:hover{filter:brightness(1.06)}
.__kit-toast{position:fixed;left:50%;bottom:42px;transform:translateX(-50%);background:#1B2028;color:#fff;font:12.5px/1 -apple-system,system-ui,sans-serif;padding:10px 16px;border-radius:8px;z-index:2147483600;box-shadow:0 8px 24px rgba(0,0,0,.24);display:none}
.__kit-toast.on{display:block}
.__kit-dragging{outline:2px dashed #2a78d6;outline-offset:-2px;opacity:.55}
.__kit-view.__kit-comp{padding:0;display:flex;flex-direction:column}
.__kit-view.__kit-comp[hidden]{display:none}
/* 编辑器自己的全局 button 样式会染到面板里，这里统一压掉 */
#__kit_mask button{background-color:transparent;box-shadow:none;font-family:inherit;letter-spacing:normal;text-transform:none;appearance:none;-webkit-appearance:none;margin:0;outline:none}
#__kit_mask .__kit-page{background-color:transparent;border:0;color:#3A4048;font-weight:400}
#__kit_mask .__kit-page:hover{background-color:#F5F7FA}
#__kit_mask .__kit-page.on{background-color:#e6f0fa;color:#2a78d6;font-weight:600}
#__kit_mask .__kit-tab{background-color:transparent;border:0;color:#8C939E;font-weight:400}
#__kit_mask .__kit-tab.on{color:#2a78d6;font-weight:600}
#__kit_mask .__kit-new{background-color:transparent;border:1px dashed #D9DEE6;color:#8C939E;margin-top:22px}
#__kit_mask .__kit-new:hover{background-color:#f4f8fd;border-color:#2a78d6;color:#2a78d6}
#__kit_mask .__kit-fbtn{background-color:#fff;border:1px solid #E1E5EB;color:#5C636D}
#__kit_mask .__kit-fbtn:hover{background-color:#F4F6F9}
#__kit_mask .__kit-fbtn.on{background-color:#e6f0fa;border-color:#2a78d6;color:#2a78d6}
#__kit_mask .__kit-x{background-color:transparent;border:0;color:#8C939E;margin-left:auto}
#__kit_mask .__kit-x:hover{background-color:#F4F6F9;color:#3A4048}
#__kit_mask .__kit-add{background-color:#2a78d6;border:1px solid #2a78d6;color:#fff}
#__kit_mask .__kit-dfoot .row button{background-color:#fff;color:#3A4048;border:1px solid #DDE1E8}
#__kit_mask .__kit-dfoot .row button.pri{background-color:#2a78d6;color:#fff;border-color:#2a78d6}
#__kit_mask .__kit-go{background-color:#2a78d6;border:0;color:#fff;box-shadow:none}
#__kit_mask input,#__kit_mask textarea,#__kit_mask select{font-family:inherit;box-shadow:none}
.__kit-prop{display:flex;gap:8px;padding:6px 12px;font-size:11.5px;color:#5C636D;border-top:1px dashed #E8EBF0}
/* ---------- 迁移表单 ---------- */
.__kit-field{margin-bottom:14px}
.__kit-fh{display:flex;align-items:baseline;gap:8px;font-size:12px;color:#5C636D;margin-bottom:6px}
.__kit-fh label{flex:0 0 auto;white-space:nowrap;font-size:12px;color:#5C636D}
.__kit-fh span{flex:1 1 auto;min-width:0;font-size:10.5px;color:#A8AEB8;font-weight:400;line-height:1.4}
.__kit-field textarea{width:100%;box-sizing:border-box;height:132px;border:1px solid #E1E5EB;border-radius:8px;padding:9px 10px;font:11.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#2A3038;background:#FAFBFC;resize:vertical;outline:none;display:block}
.__kit-field textarea:focus{border-color:#2a78d6;background:#fff}
.__kit-field input,.__kit-field select{width:100%;box-sizing:border-box;height:34px;border:1px solid #E1E5EB;border-radius:8px;padding:0 10px;font:13px/1 inherit;color:#2A3038;background:#fff;outline:none;display:block}
.__kit-field input:focus,.__kit-field select:focus{border-color:#2a78d6}
.__kit-frow{display:flex;gap:10px}
.__kit-frow .__kit-field{flex:1;min-width:0}
.__kit-go{width:100%;height:38px;border:0;border-radius:8px;background:#2a78d6;color:#fff;font:500 13px/1 inherit;cursor:pointer}
.__kit-go:hover{filter:brightness(1.04)}
.__kit-go:disabled{opacity:.6;cursor:default}
.__kit-log{margin-top:12px;font-size:11.5px;line-height:1.85;color:#6B7482;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-all}
.__kit-log:empty{display:none}
.__kit-hint{margin-top:16px;padding-top:12px;border-top:1px dashed #E8EBF0;font-size:11px;line-height:1.75;color:#A8AEB8}
.__kit-prop b{font-weight:600;color:#2A3038;min-width:74px}
`;

  // --------------------------------------------------------------- 界面
  let mask, gridEl, detailEl, dstageEl, dtaEl, sourcesCache = null;
  let dragItem = null;

  // 把屏幕坐标换算成画布坐标。画布的 board 都放在一个带 transform 的容器里，
  // transform 是 matrix(scale,0,0,scale,tx,ty)，即 screen = canvas*scale + t。
  function screenToCanvas(sx, sy) {
    let el = document.querySelector('[data-testid^="mega-artboard-frame-"]');
    let scale = 1, tx = 0, ty = 0;
    while (el) {
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none') {
        const m = t.match(/matrix\(([^)]+)\)/);
        if (m) {
          const p = m[1].split(',').map((x) => parseFloat(x));
          if (p.length === 6 && p[0] !== 0) {
            scale = p[0];
            tx = p[4];
            ty = p[5];
            break;
          }
        }
      }
      el = el.parentElement;
    }
    return { x: (sx - tx) / scale, y: (sy - ty) / scale, scale };
  }

  // 拖到画布任意位置松手 → 落到鼠标所在位置
  document.addEventListener(
    'dragover',
    (e) => {
      if (!dragItem) return;
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = 'copy';
      } catch (err) {}
    },
    true
  );
  document.addEventListener(
    'drop',
    async (e) => {
      if (!dragItem) return;
      e.preventDefault();
      e.stopPropagation();
      const it = dragItem;
      dragItem = null;
      if (mask && mask.contains(e.target)) return;
      close();
      try {
        await navigator.clipboard.writeText(buildSnippet(it, it.defaults || {}));
      } catch (e0) {}
      // 换算鼠标位置为画布坐标，组件以鼠标为中心落位
      const pt = screenToCanvas(e.clientX, e.clientY);
      addToCanvas(it, pt);
    },
    true
  );

  function fitScale(cw, ch, W, H) {
    // 按宽度适配，缩放限制在 0.4~1；比容器高的组件只显示顶部一截
    return Math.min(1, Math.max(0.5, W / cw));
  }

  // ------------------------------------------------------- 写入画布
  function b64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // 写盘：直接依赖服务端 publish 接口的 200 响应判定成功。
  // 服务端已改为「直接覆盖写」而非 tmp+rename，覆盖 canvas.json 也稳定成功，
  // 不再需要回读校验（回读会因内容格式差异导致长时间无效重试）。
  // opts.quiet：带上编辑器自己的 client id（见 index.html 的捕获脚本），
  // 服务端就不把这次写入广播回编辑器 —— 页面排序/重命名这类纯结构修改
  // 不再触发编辑器「等空闲 + 整页刷新」。
  async function pubOne(p, text, opts) {
    const entry =
      text === null
        ? { delete: true }
        : {
            base64: b64(text),
            contentType: p.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'
          };
    const headers = { 'content-type': 'application/json' };
    if (opts && opts.quiet && window.__deckClientId) headers['X-Deck-Client'] = window.__deckClientId;
    const r = await fetch(BASE + '__deck/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify({ files: { [p]: entry } })
    });
    if (!r.ok) throw new Error('写盘失败 ' + p + ' → ' + r.status);
  }

  async function pubVerify(p, text, opts) {
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
      try {
        await pubOne(p, text, opts);
        return true;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300 + i * 200));
      }
    }
    throw new Error('写盘失败: ' + p + (lastErr ? ' (' + lastErr.message + ')' : ''));
  }

  async function publishFiles(files, opts) {
    for (const [p, text] of Object.entries(files)) {
      await pubVerify(p, text, opts);
    }
    return true;
  }

  // ------------------------------------------------------------ 迁移导入
  // 把一段已有的页面源码变成画板：样式表抓回来内联、图片转 data URI、脚本全部丢掉，
  // 剩下纯 HTML 交给编辑器当普通画板用（文字可以直接点着改）。
  const MIG_BUDGET = 10 * 1024 * 1024;
  const MIG_IMG_CAP = 420 * 1024;
  const MIG_CSS_IMG_CAP = 200 * 1024;
  const MIG_BLANK =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const mig = { doc: null, base: '', name: '', spent: 0, imgs: 0, skipped: 0, busy: false };

  function migLog(msg) {
    const box = document.getElementById('__kit_mig_log');
    if (!box) return;
    const d = document.createElement('div');
    d.textContent = msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function migClearLog() {
    const box = document.getElementById('__kit_mig_log');
    if (box) box.innerHTML = '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
  }

  function absUrl(base, u) {
    try {
      return new URL(u, base).href;
    } catch (e) {
      return u;
    }
  }

  function isHttp(u) {
    return /^https?:/i.test(u);
  }

  function proxyFetch(url) {
    return fetch(BASE + '__deck/grab?url=' + encodeURIComponent(url), { cache: 'force-cache' });
  }

  async function inlineImage(abs, cap) {
    if (mig.spent > MIG_BUDGET) return null;
    try {
      const r = await proxyFetch(abs);
      if (!r.ok) return null;
      const blob = await r.blob();
      if (!blob || !blob.size || blob.size > cap) return null;
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      if (mig.spent + dataUrl.length > MIG_BUDGET) return null;
      mig.spent += dataUrl.length;
      mig.imgs++;
      return dataUrl;
    } catch (e) {
      return null;
    }
  }

  // 样式表里的图片也内联：编辑器容器的 img-src 只放行 self 和 data:，
  // 留着外链等于不显示。
  async function rewriteCss(css, base) {
    let out = String(css || '');
    out = out.replace(/@import[^;]+;/gi, '');
    out = out.replace(/@font-face\s*\{[^{}]*\}/gi, '');
    const seen = new Set();
    const hits = Array.from(out.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi));
    for (const m of hits) {
      const raw = (m[2] || '').trim();
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      if (/^(data:|blob:|about:|#)/i.test(raw)) continue;
      if (/\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(raw)) continue;
      const abs = absUrl(base, raw);
      if (!isHttp(abs)) continue;
      const dataUrl = await inlineImage(abs, MIG_CSS_IMG_CAP);
      if (dataUrl) out = out.split(m[0]).join('url("' + dataUrl + '")');
    }
    return out;
  }

  async function collectCss(doc, base) {
    const sheets = [];
    const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet" i]'));
    for (const link of links) {
      const href = link.getAttribute('href');
      const abs = href ? absUrl(base, href) : '';
      link.remove();
      if (!isHttp(abs)) continue;
      try {
        const r = await proxyFetch(abs);
        if (r.ok) sheets.push(await rewriteCss(await r.text(), abs));
      } catch (e) {}
    }
    for (const st of Array.from(doc.querySelectorAll('style'))) {
      sheets.push(await rewriteCss(st.textContent || '', base));
      st.remove();
    }
    return sheets.filter((s) => s && s.trim()).join('\n');
  }

  async function convertDoc(doc, base, width, title) {
    mig.spent = 0;
    mig.imgs = 0;
    mig.skipped = 0;

    migLog('收集样式表…');
    const css = await collectCss(doc, base);

    doc
      .querySelectorAll('script,noscript,iframe,object,embed,template,base,link,meta')
      .forEach((n) => n.remove());

    let stripped = 0;
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        if (/^on/i.test(attr.name)) {
          el.removeAttribute(attr.name);
          stripped++;
        }
      }
      const tag = el.tagName;
      if (tag === 'A') {
        const href = el.getAttribute('href') || '';
        if (href && !/^(#|javascript:|mailto:|tel:)/i.test(href)) {
          el.setAttribute('href', absUrl(base, href));
        } else if (/^javascript:/i.test(href)) {
          el.removeAttribute('href');
        }
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
        el.removeAttribute('disabled');
      }
    }

    const imgs = Array.from(doc.querySelectorAll('img'));
    if (imgs.length) migLog('内联图片 0/' + imgs.length + '…');
    let done = 0;
    for (const img of imgs) {
      const src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        img.getAttribute('data-lazy-src') ||
        '';
      img.removeAttribute('srcset');
      img.removeAttribute('data-src');
      img.removeAttribute('loading');
      done++;
      if (done % 8 === 0) migLog('内联图片 ' + done + '/' + imgs.length + '…');
      if (!src || /^data:/i.test(src)) continue;
      const abs = absUrl(base, src);
      const dataUrl = isHttp(abs) ? await inlineImage(abs, MIG_IMG_CAP) : null;
      if (dataUrl) img.setAttribute('src', dataUrl);
      else {
        img.setAttribute('src', MIG_BLANK);
        img.setAttribute('alt', img.getAttribute('alt') || '图片未能内联');
        mig.skipped++;
      }
    }

    const body = doc.body || doc.documentElement;
    const bodyStyle = (body.getAttribute('style') || '').trim();
    const inner = body.innerHTML;
    const size = width;
    const head =
      '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
      '<title>' + esc(title) + '</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n<style>\n' +
      'html,body{margin:0;padding:0}\n' +
      (bodyStyle ? 'body{' + bodyStyle + '}\n' : '') +
      css +
      '\n</style>\n</helmet>\n';
    const tail = '\n</x-dc>\n</body>\n</html>\n';
    // {{ }} 会被 dc 运行时当插值，转义掉第一个花括号（零宽空格不可见）
    const markup = (head + inner + tail).replace(/\{\{/g, '{\u200b{');

    return { markup, css, stripped, size };
  }

  async function loadMigPages() {
    const sel = document.getElementById('__kit_mig_page');
    if (!sel) return;
    let canvas = null;
    try {
      cache.delete('project/canvas.json');
      canvas = JSON.parse((await getText('project/canvas.json')) || 'null');
    } catch (e) {
      canvas = null;
    }
    const pages = (canvas && canvas.pages) || [];
    sel.innerHTML = '';
    for (const p of pages) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name || p.id;
      sel.appendChild(o);
    }
    const o = document.createElement('option');
    o.value = '__new';
    o.textContent = '＋ 新建页「迁移导入」';
    sel.appendChild(o);
    sel.value = '__new';
  }

  // 服务端只放行 /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/ 的文件名，中文名会被拒。
  // 文件名用英文序号，中文标题写进 canvas.json 的 title。
  function uniqueBoardName(canvas) {
    let i = 1;
    let name = 'Migrated-' + i + '.dc.html';
    while (canvas.boards[name]) {
      i++;
      name = 'Migrated-' + i + '.dc.html';
    }
    return name;
  }

  async function writeBoard(markup, title, width, pageId) {
    cache.delete('project/canvas.json');
    const raw = await getText('project/canvas.json');
    let canvas;
    try {
      canvas = JSON.parse(raw || 'null');
    } catch (e) {
      throw new Error('canvas.json 解析失败');
    }
    if (!canvas) throw new Error('读不到 project/canvas.json');
    canvas.boards = canvas.boards || {};
    canvas.pages = canvas.pages || [];

    let page = pageId;
    if (page === '__new' || !page) {
      page = 'migrated';
      if (!canvas.pages.some((p) => p.id === page)) {
        canvas.pages.push({ id: page, name: '03 迁移导入' });
      }
    }

    const name = uniqueBoardName(canvas);
    let x = 0;
    let y = 0;
    let any = false;
    for (const key of Object.keys(canvas.boards)) {
      const b = canvas.boards[key];
      if (!b || b.page !== page) continue;
      x = Math.max(x, (b.x || 0) + (b.w || 0) + 120);
      y = any ? Math.min(y, b.y || 0) : b.y || 0;
      any = true;
    }
    if (!any) {
      x = 0;
      y = 0;
    }

    canvas.boards[name] = {
      expand: 'fill',
      h: 900,
      is_interactive: false,
      page,
      title: title || name.replace(/\.dc\.html$/i, ''),
      w: width,
      x,
      y
    };

    await pubVerify('project/' + name, markup);
    await pubVerify('project/canvas.json', JSON.stringify(canvas, null, 2) + '\n');
    cache.delete('project/canvas.json');
    const pageObj = canvas.pages.find((p) => p.id === page);
    return { file: name, pageName: (pageObj && pageObj.name) || '' };
  }

  async function doImport() {
    if (mig.busy) return;
    const ta = document.getElementById('__kit_mig_src');
    const urlEl = document.getElementById('__kit_mig_url');
    const widthEl = document.getElementById('__kit_mig_width');
    const nameEl = document.getElementById('__kit_mig_name');
    const pageEl = document.getElementById('__kit_mig_page');
    const btn = document.getElementById('__kit_mig_go');
    if (!ta) return;

    let html = (ta.value || '').trim();
    const url = ((urlEl && urlEl.value) || '').trim();
    if (!html && url) {
      migClearLog();
      migLog('从地址抓取…');
      try {
        const r = await fetch(BASE + '__deck/grab', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const d = await r.json().catch(() => null);
        if (!d || !d.ok) throw new Error((d && d.message) || '抓取失败 ' + r.status);
        html = d.html;
        mig.base = d.url || url;
        migLog('拿到 ' + Math.round(html.length / 1024) + ' KB');
      } catch (e) {
        migLog('抓取失败：' + (e.message || e));
        return;
      }
    } else if (html && url) {
      mig.base = url;
    } else if (!mig.base) {
      mig.base = location.href;
    }
    if (!html) {
      migLog('先把页面源码粘进来，或填一个地址');
      return;
    }

    mig.busy = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '正在导入…';
    }
    try {
      migClearLog();
      migLog('解析源码…');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const baseEl = doc.querySelector('base[href]');
      if (baseEl) mig.base = absUrl(mig.base, baseEl.getAttribute('href'));
      const docTitle =
        ((nameEl && nameEl.value) || '').trim() ||
        (doc.title || '').trim() ||
        (doc.querySelector('h1') && doc.querySelector('h1').textContent.trim().slice(0, 30)) ||
        '导入页面';
      const width = Math.max(320, Math.min(2560, Number((widthEl && widthEl.value) || 1440) || 1440));

      const built = await convertDoc(doc, mig.base, width, docTitle);
      migLog('写入画板…');
      const res = await writeBoard(built.markup, docTitle, width, pageEl ? pageEl.value : '__new');
      migLog('完成：' + res.file);
      migLog(
        '内联图片 ' + mig.imgs + ' 张' + (mig.skipped ? '，未能内联 ' + mig.skipped + ' 张' : '') +
          '，去掉事件属性 ' + built.stripped + ' 个'
      );
      toast('已导入：' + res.file);
      try {
        if (res.pageName) localStorage.setItem('dc-kit-pending-page', res.pageName);
      } catch (e) {}
      setTimeout(() => location.reload(), 1100);
    } catch (e) {
      migLog('失败：' + (e && e.message ? e.message : e));
    } finally {
      mig.busy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '导入画板';
      }
    }
  }

  async function openMigrate() {
    await loadMigPages();
  }

  // 生成组件引用片段（用于剪贴板兜底）
  function buildSnippet(item, defaults) {
    const attrs = Object.keys(defaults || {})
      .filter((k) => typeof defaults[k] !== 'object')
      .map((k) => `${k}="${String(defaults[k]).replace(/"/g, '&quot;')}"`)
      .join(' ');
    return `<dc-import name="${item.key}"${attrs ? ' ' + attrs : ''}></dc-import>`;
  }

  function wrapperDoc(item) {
    const attrs = Object.keys(item.defaults || {})
      .filter((k) => typeof item.defaults[k] !== 'object')
      .map((k) => `${k}="${String(item.defaults[k]).replace(/"/g, '&quot;')}"`)
      .join(' ');
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${item.key} 实例</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<dc-import name="${item.key}" hint-size="${item.w}px,${item.h}px"${attrs ? ' ' + attrs : ''}></dc-import>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${item.w},"height":${item.h}}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>`;
  }

  // 「样式速取」：用迷你运行时把组件按默认值渲染成最终 HTML，
  // 落地时就是一份独立副本（不再引用组件定义），文字、枚举值等都可以直接改。
  function renderExpandedHtml(item) {
    if (!sourcesCache || !sourcesCache[item.key]) return '';
    const holder = document.createElement('div');
    holder.id = '__k';
    holder.style.cssText =
      'position:fixed;left:-99999px;top:0;width:' + item.w + 'px;visibility:hidden;pointer-events:none';
    document.body.appendChild(holder);
    let html = '';
    try {
      KIT_RUNTIME(sourcesCache, item.key, {});
      html = holder.innerHTML || '';
    } catch (e) {
      html = '';
    }
    holder.remove();
    // 去掉运行时的事件绑定标记，保持落地内容干净
    return html.replace(/\sdata-kb\d+="1"/g, '');
  }

  function expandedBoardDoc(item) {
    const src = sourcesCache && sourcesCache[item.key];
    const html = renderExpandedHtml(item);
    if (!html || !html.trim()) return null; // 渲染不出内容 → 调用方回退 dc-import 引用
    const style = (src && src.style) || '';
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${item.label || item.key} 副本</title>
<script src="./support.js"><\/script>
</head>
<body>
<x-dc>
<helmet>
<style>
html,body{margin:0;padding:0}
${style}
</style>
</helmet>
${html}
</x-dc>
</body>
</html>
`;
  }

  function currentPage(canvas) {
    const pages = canvas.pages || [];
    // 优先读编辑器内部记录的当前页（避免依赖已被隐藏的顶部下拉按钮）
    let txt = '';
    const el = document.querySelector('[data-testid="dc-pages"]');
    if (el) txt = el.textContent || '';
    // 兜底：读当前聚焦/高亮的画板所在页
    if (!txt) {
      const focus = document.querySelector('[data-testid="dc-outline"] [aria-current], [data-testid="dc-outline"] [data-selected="true"]');
      if (focus) txt = focus.textContent || '';
    }
    for (const p of pages) if (p.name && txt && txt.indexOf(p.name) >= 0) return p;
    return pages[0] || { id: 'home', name: '主页' };
  }

  function toast(msg, ms) {
    let t = document.getElementById('__kit_toast');
    if (!t) {
      t = document.createElement('div');
      t.id = '__kit_toast';
      t.className = '__kit-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t.__h);
    t.__h = setTimeout(() => t.classList.remove('on'), ms || 2200);
  }

  // -------------------------------------------------------- 放置态（指哪放哪）
  let placement = null; // { item, ghost, move, click, key }

  function startPlacement(item) {
    endPlacement();
    // 半透明预览：复用缩略图渲染，跟手移动
    const ghost = document.createElement('div');
    ghost.className = '__kit-ghost';
    ghost.style.cssText =
      'position:fixed;left:0;top:0;z-index:2147483001;pointer-events:none;' +
      'width:' + item.w + 'px;height:' + item.h + 'px;transform:translate(-50%,-50%);' +
      'opacity:.62;box-shadow:0 0 0 1px #2a78d6;border-radius:6px;background:#fff;overflow:hidden';
    const frame = mountFrame(buildDoc(sourcesCache, item.key, {}, true), item.w, item.h, (rw, rh, f) => {
      const sc = Math.min(1, item.w / rw, item.h / rh);
      f.style.width = rw + 'px';
      f.style.height = rh + 'px';
      f.style.transformOrigin = 'top left';
      f.style.transform = 'scale(' + sc + ')';
      f.style.display = 'block';
    });
    ghost.appendChild(frame);
    document.body.appendChild(ghost);

    const move = (e) => {
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
    };

    const click = (e) => {
      // 点击落地：换算为画布坐标，以组件中心落位
      const pt = screenToCanvas(e.clientX, e.clientY);
      endPlacement();
      addToCanvas(item, { x: pt.x, y: pt.y });
    };

    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endPlacement();
      }
    };

    // 延迟绑定 click，避免「＋」这次点击立即触发落地
    const onMove = (e) => move(e);
    const onDown = (e) => {
      if (e.button !== 0) return;
      click(e);
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', key, true);

    placement = { item, ghost, onMove, onDown, key };
    document.body.style.cursor = 'crosshair';
    toast('移动鼠标到目标位置，点击落地 · Esc 取消', 5000);
  }

  function endPlacement() {
    if (!placement) return;
    const p = placement;
    placement = null;
    document.removeEventListener('mousemove', p.onMove, true);
    document.removeEventListener('mousedown', p.onDown, true);
    document.removeEventListener('keydown', p.key, true);
    if (p.ghost && p.ghost.parentNode) p.ghost.parentNode.removeChild(p.ghost);
    document.body.style.cursor = '';
  }

  let busy = false;
  async function addToCanvas(item, at) {
    if (busy) return;
    busy = true;
    toast('正在写入画布…', 6000);
    try {
      const raw = await getText('project/canvas.json');
      if (!raw) throw new Error('读不到 canvas.json');
      const canvas = JSON.parse(raw);
      canvas.boards = canvas.boards || {};
      canvas.order = canvas.order || Object.keys(canvas.boards);
      const page = currentPage(canvas);

      const isTpl = !!item.tpl;
      let n = 1;
      let file = `${item.key}-${isTpl ? 'ref' : 'copy'}-${n}.dc.html`;
      while (canvas.boards[file]) {
        n += 1;
        file = `${item.key}-${isTpl ? 'ref' : 'copy'}-${n}.dc.html`;
      }

      let x, y;
      if (at && typeof at.x === 'number' && typeof at.y === 'number') {
        // 拖拽：以鼠标为中心落位
        x = Math.round(at.x - item.w / 2);
        y = Math.round(at.y - item.h / 2);
      } else {
        // 点击「＋画布」：自动排到当前页最右
        let maxRight = null;
        let minY = null;
        for (const f of Object.keys(canvas.boards)) {
          const b = canvas.boards[f];
          if ((b.page || page.id) !== page.id) continue;
          maxRight = maxRight === null ? (b.x || 0) + (b.w || 0) : Math.max(maxRight, (b.x || 0) + (b.w || 0));
          minY = minY === null ? b.y || 0 : Math.min(minY, b.y || 0);
        }
        x = maxRight === null ? 0 : maxRight + 60;
        y = minY === null ? 0 : minY;
      }

      canvas.boards[file] = {
        x,
        y,
        w: item.w,
        h: item.h,
        title: (item.label || item.key) + (isTpl ? ' 引用' : ' 副本'),
        page: page.id,
        is_interactive: true
      };
      if (!canvas.order.includes(file)) canvas.order.push(file);

      // 模板 → dc-import 引用（改模板全局生效）；
      // 组件 → 「默认值展开后的独立副本」（文字、枚举值可直接改），展开失败回退引用。
      const doc = isTpl
        ? wrapperDoc(item)
        : (expandedBoardDoc(item) || wrapperDoc(item));
      await publishFiles({
        ['project/' + file]: doc,
        'project/canvas.json': JSON.stringify(canvas, null, 2) + '\n'
      });
      cache.clear();
      toast(
        `已放到「${page.name}」${at ? '· 指定位置' : ''}${isTpl ? ' · 引用模板，改模板全局生效' : ' · 独立副本，可直接修改'}`,
        3000
      );
      // 不手动 location.reload()：编辑器订阅了 __deck/events 的 external-change，
      // 会自动热重载并尽量恢复视口与缩放，手动 reload 反而打断它的视图恢复。
    } catch (err) {
      busy = false;
      // 系统文件策略拦截时的兜底：复制引用，用户可贴到目标画板，或让 AI 代放
      let snippet = '';
      try {
        snippet = buildSnippet(item, item.defaults || {});
        await navigator.clipboard.writeText(snippet);
      } catch (e0) {}
      toast(
        '画布写入被系统拦截' + (snippet ? '，引用已复制到剪贴板' : '') + '；也可以直接告诉我「把 ' +
          item.label + ' 放到 XX 页」，我来放',
        6500
      );
    }
  }

  function card(item) {
    const el = document.createElement('div');
    el.className = '__kit-card';
    const thumb = document.createElement('div');
    thumb.className = '__kit-thumb';

    const BOX_W = 72, BOX_H = 36;
    const clip = document.createElement('div');
    clip.className = 'clip';
    clip.style.overflow = 'hidden';
    clip.style.background = '#fff';
    const inner = document.createElement('div');
    inner.style.transformOrigin = 'top left';
    const frame = mountFrame(buildDoc(sourcesCache, item.key, {}, true), item.w, item.h, (rw, rh, f) => {
      // 整体可见：宽和高都适配，能 1:1 就 1:1；下限 0.2 保证高组件仍可读顶部
      const sc = Math.max(0.2, Math.min(1, BOX_W / rw, BOX_H / rh));
      const ch = rh * sc;
      clip.style.width = Math.min(rw * sc, BOX_W) + 'px';
      clip.style.height = Math.min(ch, BOX_H) + 'px';
      clip.style.boxShadow = '0 0 0 1px rgba(20,22,26,.09)';
      clip.style.borderRadius = '4px';
      inner.style.width = rw + 'px';
      inner.style.height = rh + 'px';
      inner.style.transform = `scale(${sc})`;
      f.style.width = rw + 'px';
      f.style.height = rh + 'px';
      // 关键：clip 内左顶对齐 + transform-origin top left，
      // 否则 flex 居中会把变换后的内容推出裁剪区（高组件显示为白块）
      clip.style.alignItems = 'flex-start';
      clip.style.justifyContent = 'flex-start';
    });
    inner.appendChild(frame);
    clip.appendChild(inner);
    thumb.appendChild(clip);

    const addBtn = document.createElement('button');
    addBtn.className = '__kit-add';
    addBtn.type = 'button';
    addBtn.textContent = '＋';
    addBtn.title = item.tpl
      ? '以引用放入：修改模板会全局生效'
      : '放入画布：生成可独立修改的副本';
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
      startPlacement(item);
    });

    el.draggable = true;
    let downX = 0, downY = 0, dragged = false;
    el.addEventListener('mousedown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      dragged = false;
    });
    el.addEventListener('dragstart', (e) => {
      dragItem = item;
      dragged = true;
      try {
        e.dataTransfer.setData('text/plain', item.key);
        e.dataTransfer.effectAllowed = 'copy';
      } catch (err) {}
      setTimeout(() => el.classList.add('__kit-dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('__kit-dragging');
      setTimeout(() => (dragItem = null), 200);
    });

    const meta = document.createElement('div');
    meta.className = '__kit-meta';
    const b = document.createElement('b');
    b.textContent = item.label;
    const i = document.createElement('i');
    i.textContent = `${item.key} · ${item.w}×${item.h}${item.tpl ? ' · 模板' : ''}`;
    meta.append(b, i);

    el.append(thumb, meta, addBtn);
    // 只有「没拖动」的点击才打开详情，拖动松手不误触
    el.addEventListener('click', (e) => {
      const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
      if (dragged || moved > 6) return;
      openDetail(item);
    });
    return el;
  }

  async function openDetail(item) {
    if (!detailEl) return;
    detailEl.classList.add('on');
    mask.querySelector('.__kit-body').classList.add('detail');
    dstageEl.innerHTML = '';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const availW = Math.max(240, (dstageEl.clientWidth || 780) - 56);
    const availH = Math.max(200, (dstageEl.clientHeight || 420) - 40);
    const s = Math.min(1, Math.max(0.6, Math.min(availW / item.w, availH / item.h)));
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:${item.w * s}px;height:${item.h * s}px;overflow:hidden;box-shadow:0 2px 14px rgba(20,22,26,.10);border-radius:6px;background:#fff`;
    const inner = document.createElement('div');
    inner.style.cssText = `transform:scale(${s});transform-origin:top left;width:${item.w}px;height:${item.h}px`;
    inner.appendChild(mountFrame(buildDoc(sourcesCache, item.key, {}, true), item.w, item.h));
    wrap.appendChild(inner);
    dstageEl.appendChild(wrap);

    const attrs = Object.keys(item.defaults)
      .filter((k) => typeof item.defaults[k] !== 'object')
      .map((k) => `${k}="${String(item.defaults[k]).replace(/"/g, '&quot;')}"`)
      .join(' ');
    dtaEl.value = `<dc-import name="${item.key}"${attrs ? ' ' + attrs : ''}></dc-import>`;
  }

  // ------------------------------------------------------- 页面结构数据
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function currentPageName() {
    const el = document.querySelector('[data-dc-page-name]');
    return el ? (el.textContent || '').trim() : '';
  }

  async function loadPages() {
    let canvas = null;
    try {
      canvas = JSON.parse((await getText('project/canvas.json')) || 'null');
    } catch (e) {
      canvas = null;
    }
    if (!canvas) return [];
    const pages = canvas.pages || [];
    const boards = canvas.boards || {};
    const counts = {};
    for (const f of Object.keys(boards)) {
      const pid = boards[f].page || (pages[0] && pages[0].id);
      counts[pid] = (counts[pid] || 0) + 1;
    }
    const list = pages.map((p) => ({
      id: p.id,
      name: p.name || '未命名页面',
      count: counts[p.id] || 0,
      parentId: p.parentId || ''
    }));
    // 递归算真实层级（多级），带环保护
    const byId = new Map(list.map((p) => [p.id, p]));
    const depthOf = (p) => {
      let d = 0;
      let cur = p;
      const seen = new Set([p.id]);
      while (cur && cur.parentId && byId.has(cur.parentId)) {
        if (seen.has(cur.parentId)) break;
        seen.add(cur.parentId);
        cur = byId.get(cur.parentId);
        d++;
        if (d > 50) break;
      }
      return d;
    };
    list.forEach((p) => { p.level = depthOf(p); });
    return list;
  }

  let pagesCache = [];
  let pageFilter = '';
  // 折叠状态记忆（按页面 id）
  const COLLAPSE_KEY = 'dc-kit-page-collapse-v1';
  let collapsedSet = new Set();
  try {
    collapsedSet = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'));
  } catch (e) { collapsedSet = new Set(); }
  function saveCollapse() {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(collapsedSet))); } catch (e) {}
  }

  // 重命名映射：quiet 写盘后编辑器自带的页面下拉仍是旧名字（下次刷新才更新），
  // switchPage 找不到新名字时用旧名字再试一次。
  const ALIAS_KEY = 'dc-kit-page-alias-v1';
  let pageAlias = {};
  try {
    pageAlias = JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') || {};
  } catch (e) {
    pageAlias = {};
  }
  function saveAlias() {
    try {
      const keys = Object.keys(pageAlias);
      if (keys.length > 200) {
        keys.slice(0, keys.length - 200).forEach((k) => delete pageAlias[k]);
      }
      localStorage.setItem(ALIAS_KEY, JSON.stringify(pageAlias));
    } catch (e) {}
  }

  async function savePageStructure(nextPages) {
    cache.delete('project/canvas.json');
    const src = await getText('project/canvas.json');
    if (!src) throw new Error('读取 canvas.json 失败');
    const canvas = JSON.parse(src);
    const byId = new Map(nextPages.map((p) => [p.id, p]));
    canvas.pages = nextPages.map((p) => {
      const old = (canvas.pages || []).find((x) => x.id === p.id) || { id: p.id, name: p.name };
      const out = Object.assign({}, old, { id: p.id, name: p.name });
      if (p.parentId && byId.has(p.parentId) && p.parentId !== p.id) out.parentId = p.parentId;
      else delete out.parentId;
      return out;
    });
    // 记录重命名映射（旧名 → 新名）
    nextPages.forEach((np) => {
      const prev = pagesCache.find((x) => x.id === np.id);
      if (prev && prev.name && prev.name !== np.name) pageAlias[prev.name] = np.name;
    });
    saveAlias();
    // quiet：带上编辑器自己的 client id，服务端不广播回编辑器 → 不触发整页刷新。
    // 安全网：编辑器自己后续保存布局时带 ifMatch 版本校验，发现 canvas.json 已被
    // 改过会走「别人保存过，未保存的布局改动已丢弃」的冲突流程，不会静默覆盖。
    await pubVerify('project/canvas.json', JSON.stringify(canvas, null, 2) + '\n', { quiet: true });
    cache.delete('project/canvas.json');
    pagesCache = await loadPages();
    renderPages();
  }

  function clearDropState() {
    document.querySelectorAll('#__kit_pagelist .__kit-page').forEach((el) => {
      el.classList.remove('drop-before', 'drop-after', 'drop-child');
      delete el.dataset.dropMode;
    });
  }

  // 页面拖拽状态。监听必须挂在 document 上：编辑器会在 documentElement 上
  // setPointerCapture，行内 pointermove/up 因此收不到，看起来就像拖完没变化。
  let pageDrag = null; // { sourceId, startX, startY, moved, el, pointerId }
  let suppressPageClick = false;

  function pageItems() {
    return Array.from(document.querySelectorAll('#__kit_pagelist .__kit-page'));
  }

  function hitPageItem(clientX, clientY, sourceEl) {
    const items = pageItems();
    if (!items.length) return null;
    // 先看指针落在哪一行；落到空隙或列表外时，落到最近的一行以便排到头/尾
    let hit = null;
    for (const it of items) {
      if (it === sourceEl) continue;
      const r = it.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        hit = it;
        break;
      }
    }
    if (!hit) {
      const first = items[0];
      const last = items[items.length - 1];
      const f = first.getBoundingClientRect();
      const l = last.getBoundingClientRect();
      if (clientY < f.top && first !== sourceEl) hit = first;
      else if (clientY > l.bottom && last !== sourceEl) hit = last;
      else {
        // 指针还在源行附近：选源行上方或下方最近的一行
        let best = null;
        let bestDist = Infinity;
        for (const it of items) {
          if (it === sourceEl) continue;
          const r = it.getBoundingClientRect();
          const mid = (r.top + r.bottom) / 2;
          const d = Math.abs(clientY - mid);
          if (d < bestDist) {
            best = it;
            bestDist = d;
          }
        }
        hit = best;
      }
    }
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    const y = (clientY - r.top) / Math.max(1, r.height);
    const x = (clientX - r.left) / Math.max(1, r.width);
    const mode = x > 0.52 && y > 0.25 && y < 0.75 ? 'child' : y < 0.5 ? 'before' : 'after';
    return { el: hit, mode };
  }

  function paintDropTarget(clientX, clientY, sourceEl) {
    const items = pageItems();
    for (const it of items) {
      it.classList.remove('drop-before', 'drop-after', 'drop-child');
      delete it.dataset.dropMode;
    }
    const src = sourceEl || (pageDrag && pageDrag.el);
    if (!src) return null;
    const hit = hitPageItem(clientX, clientY, src);
    if (!hit) return null;
    hit.el.dataset.dropMode = hit.mode;
    hit.el.classList.add(
      hit.mode === 'child' ? 'drop-child' : hit.mode === 'before' ? 'drop-before' : 'drop-after'
    );
    return hit;
  }

  const PAGE_DRAG_EVENTS = [
    ['pointermove', pageDragMove],
    ['pointerup', pageDragEnd],
    ['pointercancel', pageDragOnCancel],
    ['mousemove', pageDragMove],
    ['mouseup', pageDragEnd],
    ['lostpointercapture', pageDragOnLostCapture]
  ];

  function unbindPageDragListeners() {
    for (const [type, fn] of PAGE_DRAG_EVENTS) {
      window.removeEventListener(type, fn, true);
      document.removeEventListener(type, fn, true);
    }
  }

  function bindPageDragListeners() {
    for (const [type, fn] of PAGE_DRAG_EVENTS) {
      window.addEventListener(type, fn, true);
      document.addEventListener(type, fn, true);
    }
  }

  function releaseForeignCapture(pointerId) {
    if (pointerId == null) return;
    const nodes = [document.documentElement, document.body];
    for (const n of nodes) {
      if (!n || !n.hasPointerCapture) continue;
      try {
        if (n.hasPointerCapture(pointerId)) n.releasePointerCapture(pointerId);
      } catch (_) {}
    }
  }

  function samePagePointer(e) {
    if (!e || pageDrag.pointerId === undefined) return true;
    if (e.pointerId === undefined || e.pointerId === -1) return true;
    return e.pointerId === pageDrag.pointerId;
  }

  function pageRowFromEvent(e) {
    const t = e && e.target;
    if (!t || !t.closest) return null;
    if (t.closest('.__kit-page-op') || t.closest('.__kit-caret') || t.closest('input, textarea, select')) return null;
    return t.closest('#__kit_pagelist .__kit-page');
  }

  function pageFromRow(row) {
    if (!row) return null;
    const id = row.dataset.pageId;
    return pagesCache.find((x) => x.id === id) || null;
  }

  function onPageListPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const row = pageRowFromEvent(e);
    const p = pageFromRow(row);
    if (!p) return;
    pageDragStart(e, p, row);
  }

  function pageDragStart(e, p, b) {
    if (e.button !== undefined && e.button !== 0) return;
    if (pageDrag) {
      unbindPageDragListeners();
      pageDrag.el.classList.remove('dragging');
      pageDrag = null;
      clearDropState();
    }
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    pageDrag = {
      sourceId: p.id,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      el: b,
      pointerId: e.pointerId
    };
    // 不要在行上 setPointerCapture：编辑器会把 capture 抢到 html 上并触发
    // pointercancel，拖拽会被立刻取消，看起来就像完全没反应。
    bindPageDragListeners();
  }

  function pageDragMove(e) {
    if (!pageDrag || !samePagePointer(e)) return;
    const clientX = typeof e.clientX === 'number' ? e.clientX : pageDrag.lastX;
    const clientY = typeof e.clientY === 'number' ? e.clientY : pageDrag.lastY;
    pageDrag.lastX = clientX;
    pageDrag.lastY = clientY;
    const dx = clientX - pageDrag.startX;
    const dy = clientY - pageDrag.startY;
    if (!pageDrag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    if (!pageDrag.moved) {
      pageDrag.moved = true;
      pageDrag.el.classList.add('dragging');
    }
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    releaseForeignCapture(pageDrag.pointerId);
    paintDropTarget(clientX, clientY);
  }

  function pageDragOnCancel(e) {
    if (!pageDrag || !samePagePointer(e)) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    releaseForeignCapture(pageDrag.pointerId);
    // 编辑器抢 capture 时经常会发 pointercancel。不要中止，等 pointerup / mouseup 收尾。
  }

  function pageDragOnLostCapture(e) {
    if (!pageDrag || !samePagePointer(e)) return;
    releaseForeignCapture(pageDrag.pointerId);
  }

  async function pageDragEnd(e) {
    if (!pageDrag || !samePagePointer(e)) return;
    const pg = pageDrag;
    const clientX = e && typeof e.clientX === 'number' ? e.clientX : pg.lastX;
    const clientY = e && typeof e.clientY === 'number' ? e.clientY : pg.lastY;
    // 必须先算落点，再清空 pageDrag：paintDropTarget 依赖源行，且一开始会清掉 dropMode。
    const hit = pg.moved ? paintDropTarget(clientX, clientY, pg.el) : null;
    const target = hit ? hit.el : null;
    const mode = hit ? hit.mode : null;
    const targetId = target ? target.dataset.pageId : null;
    pageDrag = null;
    unbindPageDragListeners();
    try { pg.el.releasePointerCapture(pg.pointerId); } catch (_) {}
    pg.el.classList.remove('dragging');
    clearDropState();
    if (!pg.moved) return;
    suppressPageClick = true;
    setTimeout(() => { suppressPageClick = false; }, 80);
    if (!targetId || !mode) return;
    try {
      await applyPageDrop(pg.sourceId, targetId, mode);
    } catch (err) {
      toast('页面结构保存失败：' + (err && err.message ? err.message : '未知错误'));
    }
  }

  // 判断 ancestorId 是否是 id 的祖先（含自身），用于防止把父节点拖进自己的子树
  function isDescendant(id, ancestorId, byId) {
    let cur = byId.get(id);
    const seen = new Set();
    while (cur) {
      if (cur.id === ancestorId) return true;
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return false;
  }

  async function applyPageDrop(sourceId, targetId, mode) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const list = pagesCache.map((p) => Object.assign({}, p));
    const byId = new Map(list.map((p) => [p.id, p]));
    const srcIndex = list.findIndex((p) => p.id === sourceId);
    const target = byId.get(targetId);
    if (srcIndex < 0 || !target) return;
    // 防止拖进自己的子树
    if (isDescendant(targetId, sourceId, byId)) {
      toast('不能把页面移动到它自己的子页面里');
      return;
    }

    // 取出源节点（不含其子树，子树靠 parentId 自动跟随）
    const source = list.splice(srcIndex, 1)[0];

    // 计算目标父级
    let newParent;
    if (mode === 'child') {
      newParent = target.id; // 成为 target 的子节点
    } else {
      newParent = target.parentId || ''; // 与 target 同级
    }
    source.parentId = newParent;

    // 重新计算插入下标（在移除源之后的列表里）
    let insertAt;
    if (mode === 'before') {
      insertAt = list.findIndex((p) => p.id === target.id);
    } else if (mode === 'after') {
      // 插到 target 之后：跳过 target 的整棵子树
      insertAt = list.findIndex((p) => p.id === target.id) + 1;
      while (insertAt < list.length && isDescendant(list[insertAt].id, target.id, byId)) insertAt++;
    } else {
      // child：插到 target 子节点的最前面（紧跟 target）
      insertAt = list.findIndex((p) => p.id === target.id) + 1;
    }
    if (insertAt < 0) insertAt = list.length;
    list.splice(insertAt, 0, source);

    await savePageStructure(list);
    // 设为子页面后，自动展开目标父级，便于看到结果
    if (mode === 'child') {
      collapsedSet.delete(target.id);
      saveCollapse();
    }
    toast(mode === 'child' ? '页面层级已更新' : '页面顺序已更新');
  }

  function renderPages() {
    const box = document.getElementById('__kit_pagelist');
    if (!box) return;
    const cur = currentPageName();
    const q = pageFilter.trim().toLowerCase();
    box.innerHTML = '';
    if (!pagesCache.length) {
      const d = document.createElement('div');
      d.className = '__kit-empty';
      d.style.padding = '20px 4px';
      d.textContent = '这个画布还没有页面';
      box.appendChild(d);
      return;
    }

    // 建立 id -> 页面、父 -> 子的映射，保留 pagesCache 的相对顺序
    const byId = new Map(pagesCache.map((p) => [p.id, p]));
    const childrenOf = new Map();
    pagesCache.forEach((p) => {
      const pid = p.parentId && byId.has(p.parentId) ? p.parentId : '';
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(p);
    });

    // 搜索：匹配的页面 + 其所有祖先都要显示（祖先用于保留路径），并强制展开路径
    const matchSet = new Set();
    if (q) {
      pagesCache.forEach((p) => {
        if (p.name.toLowerCase().indexOf(q) >= 0) {
          matchSet.add(p.id);
          let cur2 = p;
          const seen = new Set([p.id]);
          while (cur2 && cur2.parentId && byId.has(cur2.parentId)) {
            if (seen.has(cur2.parentId)) break;
            seen.add(cur2.parentId);
            matchSet.add(cur2.parentId);
            cur2 = byId.get(cur2.parentId);
          }
        }
      });
      if (!matchSet.size) {
        const d = document.createElement('div');
        d.className = '__kit-empty';
        d.style.padding = '20px 4px';
        d.textContent = '没有匹配的页面';
        box.appendChild(d);
        return;
      }
    }

    // 搜索时，只渲染匹配路径上的节点（matchSet 已含匹配项及其祖先）
    const visible = (p) => !q || matchSet.has(p.id);

    // 递归渲染一个节点及其子树（仅渲染可见节点）
    const renderNode = (p, depth) => {
      if (!visible(p)) return;
      const allKids = childrenOf.get(p.id) || [];
      const kids = allKids.filter(visible);
      const hasKids = allKids.length > 0;
      const searching = !!q;
      // 折叠：搜索时强制展开；否则看 collapsedSet
      const isCollapsed = !searching && collapsedSet.has(p.id);

      const node = document.createElement('div');
      node.className = '__kit-page' + (p.name === cur ? ' on' : '') + (isCollapsed ? ' collapsed' : '');
      node.dataset.pageId = p.id;
      node.style.touchAction = 'none';
      node.style.userSelect = 'none';

      const row = document.createElement('div');
      row.className = 'row';
      row.style.paddingLeft = (4 + depth * 16) + 'px';
      row.title = p.name + ' · ' + p.count + ' 个画板；拖动可调整顺序和层级';

      // 折叠箭头
      const caret = document.createElement('button');
      caret.type = 'button';
      caret.className = '__kit-caret' + (hasKids ? '' : ' leaf');
      caret.innerHTML = ICON.caret;
      caret.setAttribute('aria-label', hasKids ? '折叠/展开' : '');
      if (hasKids) {
        caret.addEventListener('click', (e) => {
          e.stopPropagation();
          if (collapsedSet.has(p.id)) collapsedSet.delete(p.id);
          else collapsedSet.add(p.id);
          saveCollapse();
          renderPages();
        });
      }

      // 拖拽把手
      const drag = document.createElement('i');
      drag.className = '__kit-drag';
      drag.innerHTML = ICON.drag;
      drag.setAttribute('aria-hidden', 'true');

      // 名称（搜索高亮）
      const t = document.createElement('span');
      t.className = '__kit-name';
      if (q) {
        const i = p.name.toLowerCase().indexOf(q);
        if (i >= 0) {
          t.appendChild(document.createTextNode(p.name.slice(0, i)));
          const mk = document.createElement('mark');
          mk.textContent = p.name.slice(i, i + q.length);
          t.appendChild(mk);
          t.appendChild(document.createTextNode(p.name.slice(i + q.length)));
        } else {
          t.textContent = p.name;
        }
      } else {
        t.textContent = p.name;
      }

      // 画板数
      const cnt = document.createElement('span');
      cnt.className = '__kit-count';
      cnt.textContent = p.count ? String(p.count) : '';

      // 操作按钮（统一 SVG 图标）
      const op = document.createElement('span');
      op.className = '__kit-page-op';
      const rnBtn = document.createElement('button');
      rnBtn.type = 'button';
      rnBtn.className = 'ren';
      rnBtn.title = '重命名';
      rnBtn.innerHTML = ICON.rename;
      rnBtn.addEventListener('click', (e) => { e.stopPropagation(); renamePage(p); });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'del';
      delBtn.title = '删除页面';
      delBtn.innerHTML = ICON.trash;
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); deletePage(p); });
      op.append(rnBtn, delBtn);

      row.append(caret, drag, t, cnt, op);
      node.appendChild(row);

      row.addEventListener('click', (e) => {
        const t = e.target;
        if (t && t.closest && t.closest('input, textarea, select, .__kit-caret, .__kit-page-op')) return;
        if (suppressPageClick || (pageDrag && pageDrag.moved)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        switchPage(p.name);
      });
      row.addEventListener('selectstart', (e) => e.preventDefault());

      box.appendChild(node);

      // 子节点（kids 已按搜索过滤）
      if (kids.length && !isCollapsed) {
        kids.forEach((k) => renderNode(k, depth + 1));
      }
    };

    const roots = childrenOf.get('') || [];
    roots.forEach((p) => renderNode(p, 0));
  }

  // 重命名页面：替换原文字为输入框，回车/失焦提交
  function renamePage(p) {
    const box = document.getElementById('__kit_pagelist');
    const row = box.querySelector('[data-page-id="' + p.id + '"]');
    if (!row) return;
    const span = row.querySelector('span.__kit-name');
    if (!span) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = '__kit-rename-input';
    input.value = p.name;
    input.spellcheck = false;
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (!name || name === p.name) { renderPages(); return; }
      try {
        const list = pagesCache.map((x) => (x.id === p.id ? Object.assign({}, x, { name }) : Object.assign({}, x)));
        await savePageStructure(list);
        toast('已重命名为「' + name + '」');
      } catch (err) {
        toast('重命名失败：' + (err && err.message ? err.message : '未知错误'));
        renderPages();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; renderPages(); }
    });
    input.addEventListener('blur', commit);
  }

  // 删除页面：二次确认后从 canvas.pages 移除，其子页面一并提升为顶级
  async function deletePage(p) {
    if (!confirm('确定删除页面「' + p.name + '」吗？\n其下的画板不会删除，子页面会提升到上一级。')) return;
    const list = pagesCache
      .filter((x) => x.id !== p.id)
      // 子页面提升到被删页的父级（保持层级连续）
      .map((x) => (x.parentId === p.id ? Object.assign({}, x, { parentId: p.parentId || '' }) : Object.assign({}, x)));
    try {
      await savePageStructure(list);
      toast('已删除「' + p.name + '」');
    } catch (err) {
      toast('删除失败：' + (err && err.message ? err.message : '未知错误'));
    }
  }

  async function withPagesMenu(fn) {
    const btn = document.querySelector('[data-testid="dc-pages"]');
    if (!btn) return false;
    // 可能已经开着（上一次没关干净），先关掉再开，否则 click 只是把它收起
    if (document.querySelector('[data-dc-pages-list]')) {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(140);
    }
    btn.click();
    for (let i = 0; i < 25; i++) {
      await sleep(60);
      const pop = document.querySelector('[data-dc-pages-list]');
      if (!pop) continue;
      const done = fn(pop);
      if (!done) {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
      return !!done;
    }
    return false;
  }

  async function switchPage(name, retry) {
    const ok = await withPagesMenu((pop) => {
      const cands = Array.from(pop.querySelectorAll('button'));
      const t = cands.find((b) => (b.textContent || '').trim().replace(/\s+/g, ' ') === name)
        || cands.find((b) => (b.textContent || '').trim().indexOf(name) === 0);
      if (!t) return false;
      t.click();
      return true;
    });
    if (!ok && !retry) {
      // 编辑器下拉里可能还是重命名前的旧名字，用映射再试一次
      const oldName = Object.keys(pageAlias).find((o) => pageAlias[o] === name);
      if (oldName) return switchPage(oldName, true);
      await sleep(160);
      return switchPage(name, true);
    }
    if (!ok) toast('没找到这个页面，可能已被重命名');
    setTimeout(async () => {
      pagesCache = await loadPages();
      renderPages();
    }, 420);
  }

  async function newPage() {
    const ok = await withPagesMenu((pop) => {
      const t = Array.from(pop.querySelectorAll('button')).find((b) =>
        /new page|新建页面|添加页面/i.test(b.textContent || '')
      );
      if (!t) return false;
      t.click();
      return true;
    });
    if (!ok) {
      toast('找不到「新建页面」，编辑器可能只读');
      return;
    }
    setTimeout(async () => {
      pagesCache = await loadPages();
      renderPages();
    }, 700);
  }

  async function refreshPages() {
    pagesCache = await loadPages();
    renderPages();
  }

  // ------------------------------------------------------------ 面板开关
  const WIDTH_KEY = 'dc-kit-panel-width-v1';
  const OPEN_KEY = 'dc-kit-panel-open-v1';

  function applyWidth(w) {
    const v = Math.max(260, Math.min(460, Math.round(w)));
    if (mask) mask.style.width = v + 'px';
    try {
      localStorage.setItem(WIDTH_KEY, String(v));
    } catch (e) {}
  }

  // 编辑器的根容器带 transform，fixed 会相对它定位，左边可能多出一条缝。
  // 这个偏移只在启动时量一次：画布平移会改变量出来的值，反复测量会把面板推歪。
  let DX = 0;
  function measureDx() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(p);
    const v = p.getBoundingClientRect().left || 0;
    p.remove();
    return Math.abs(v) <= 24 ? v : 0;
  }

  function alignLeft() {
    if (mask) mask.style.left = -DX + 'px';
    const h = document.getElementById('__kit_handle');
    if (h) h.style.left = -DX + 'px';
  }

  // 面板贴住入口按钮下方弹出（左边对齐按钮，空间不够时向右收）
  function positionPanel() {
    if (!mask) return;
    const h = document.getElementById('__kit_handle');
    if (!h) return;
    const r = h.getBoundingClientRect();
    const w = mask.offsetWidth || 300;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    mask.style.left = Math.max(8, Math.round(left)) + 'px';
    mask.style.top = Math.round(r.bottom + 8) + 'px';
  }

  function open() {
    if (!mask) return;
    positionPanel();
    mask.classList.add('on');
    const h = document.getElementById('__kit_handle');
    if (h) h.classList.add('on');
    try {
      localStorage.setItem(OPEN_KEY, '1');
    } catch (e) {}
    if (!gridEl.childNodes.length) refresh();
    refreshPages();
    jumpToPendingPage();
  }

  // 刚导入完会存下目标页名，重载后自动切过去，省得再去页面列表里找。
  // 编辑器挂载有延迟，第一次切可能扑空，所以重试几次，成功才清标记。
  function jumpToPendingPage() {
    let pending = '';
    try {
      pending = localStorage.getItem('dc-kit-pending-page') || '';
    } catch (e) {}
    if (!pending) return;
    let tick = 0;
    const clear = () => {
      try {
        localStorage.removeItem('dc-kit-pending-page');
      } catch (e) {}
    };
    const step = () => {
      tick++;
      if (currentPageName() === pending) return clear();
      if (tick > 4) return clear();
      switchPage(pending);
      setTimeout(() => {
        if (currentPageName() === pending) clear();
        else step();
      }, 2200);
    };
    setTimeout(step, 1600);
  }

  function close() {
    if (!mask) return;
    mask.classList.remove('on');
    const h = document.getElementById('__kit_handle');
    if (h) h.classList.remove('on');
    try {
      localStorage.setItem(OPEN_KEY, '0');
    } catch (e) {}
  }

  function toggle() {
    if (mask && mask.classList.contains('on')) close();
    else open();
  }

  function switchTab(name) {
    document.querySelectorAll('.__kit-tab').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-tab') === name);
    });
    ['pages', 'comp', 'tpl', 'mig'].forEach((k) => {
      const v = document.getElementById('__kit_view_' + k);
      if (v) v.hidden = k !== name;
    });
    if (name === 'pages') refreshPages();
    if (name === 'mig') openMigrate();
  }

  async function refresh() {
    if (!gridEl) return;
    gridEl.innerHTML = '<div class="__kit-empty">正在读取画布组件…</div>';
    const data = await loadData();
    if (data.error) {
      gridEl.innerHTML = `<div class="__kit-empty">${data.error}</div>`;
      return;
    }
    sourcesCache = data.sources;
    gridEl.innerHTML = '';
    if (!data.items.length) {
      gridEl.innerHTML =
        '<div class="__kit-empty">这个画布还没有组件页。<br>新建一个名为「组件」的页面，把组件板放进去，这里会自动出现。</div>';
      return;
    }
    for (const it of data.items) gridEl.appendChild(card(it));
  }

  function buildUI() {
    if (document.getElementById('__kit_mask')) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    mask = document.createElement('div');
    mask.className = '__kit-panel';
    mask.id = '__kit_mask';
    mask.innerHTML = `
        <div class="__kit-tabs">
          <button class="__kit-tab on" type="button" data-tab="pages">页面</button>
          <button class="__kit-tab" type="button" data-tab="tpl">模板</button>
          <button class="__kit-tab" type="button" data-tab="comp">组件</button>
          <button class="__kit-tab" type="button" data-tab="mig">迁移</button>
          <button class="__kit-x" type="button" data-x="close" aria-label="收起面板">${ICON.close}</button>
        </div>
        <div class="__kit-body">
          <div class="__kit-view" id="__kit_view_pages">
            <div class="__kit-page-search"><span class="ico">${ICON.search}</span><input type="text" id="__kit_page_search" placeholder="搜索页面名称…" spellcheck="false" autocomplete="off"></div>
            <div class="__kit-page-help"><span>拖动调整顺序；拖到行中段设为子页面</span><button type="button" id="__kit_fbtn">刷新</button></div>
            <div class="__kit-pages" id="__kit_pagelist"></div>
            <button class="__kit-new" type="button" data-x="newpage">${ICON.plus}<span>新建页面</span></button>
          </div>
          <div class="__kit-view __kit-comp" id="__kit_view_comp" hidden>
            <div class="__kit-grid" id="__kit_grid"></div>
            <div class="__kit-detail" id="__kit_detail">
              <div class="__kit-dstage" id="__kit_stage"></div>
              <div class="__kit-dfoot">
                <textarea id="__kit_code" spellcheck="false"></textarea>
                <div class="row">
                  <button data-x="back">← 组件列表</button>
                  <button class="pri" data-x="copy">复制引用</button>
                  <span id="__kit_tip" style="font-size:11px;color:#8C939E"></span>
                </div>
              </div>
            </div>
          </div>
          <div class="__kit-view" id="__kit_view_tpl" hidden>
            <div class="__kit-empty">还没有模板。<br>把常用版式存成模板后会出现在这里。</div>
          </div>
          <div class="__kit-view" id="__kit_view_mig" hidden>
            <p class="__kit-label">把已有页面变成可编辑画板</p>

            <div class="__kit-field">
              <div class="__kit-fh"><label>页面源码</label><span>在浏览器里 Cmd+A 全选复制，或 DevTools → Copy outerHTML</span></div>
              <textarea id="__kit_mig_src" spellcheck="false" placeholder="粘贴整页 HTML 源码…"></textarea>
            </div>

            <div class="__kit-field">
              <div class="__kit-fh"><label>原页面地址</label><span>用来补全图片和样式表的相对路径，可留空</span></div>
              <input id="__kit_mig_url" type="text" placeholder="https://your-admin.example.com/list" spellcheck="false" autocomplete="off">
            </div>

            <div class="__kit-frow">
              <div class="__kit-field">
                <div class="__kit-fh"><label>画板宽度</label></div>
                <input id="__kit_mig_width" type="number" value="1440" min="320" max="2560" step="1">
              </div>
              <div class="__kit-field">
                <div class="__kit-fh"><label>名称</label></div>
                <input id="__kit_mig_name" type="text" placeholder="留空取页面标题" spellcheck="false" autocomplete="off">
              </div>
            </div>

            <div class="__kit-field">
              <div class="__kit-fh"><label>放到哪个页面</label></div>
              <select id="__kit_mig_page"></select>
            </div>

            <button class="__kit-go" type="button" id="__kit_mig_go">导入画板</button>
            <div class="__kit-log" id="__kit_mig_log"></div>

            <div class="__kit-hint">
              脚本不会执行，只搬结构、文字、样式和图片。<br>
              图片按 420KB 上限内联，太大的留空位；网络字体不搬。
            </div>
          </div>
        </div>
        <div class="__kit-grip" id="__kit_grip" title="拖动调整宽度"></div>`;
    document.body.appendChild(mask);

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = '__kit-handle';
    handle.id = '__kit_handle';
    handle.innerHTML = ICON.menu;
    handle.title = '页面 / 组件面板';
    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(handle);

    gridEl = mask.querySelector('#__kit_grid');
    detailEl = mask.querySelector('#__kit_detail');
    dstageEl = mask.querySelector('#__kit_stage');
    dtaEl = mask.querySelector('#__kit_code');

    DX = measureDx();
    try {
      const w = Number(localStorage.getItem(WIDTH_KEY));
      if (w) applyWidth(w);
      if (localStorage.getItem(OPEN_KEY) === '1') open();
    } catch (e) {}

    // 点面板外部关闭（弹出式）
    document.addEventListener('pointerdown', (e) => {
      if (!mask.classList.contains('on')) return;
      if (mask.contains(e.target) || handle.contains(e.target)) return;
      close();
    }, true);
    // ESC 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !mask.classList.contains('on')) return;
      close();
    });

    // 标签切换
    mask.querySelectorAll('.__kit-tab').forEach((b) => {
      b.addEventListener('click', () => switchTab(b.getAttribute('data-tab')));
    });

    // 页面结构刷新
    const migGo = mask.querySelector('#__kit_mig_go');
    if (migGo) migGo.addEventListener('click', () => doImport());
    // 页面名称搜索
    const searchEl = mask.querySelector('#__kit_page_search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        pageFilter = searchEl.value || '';
        renderPages();
      });
    }
    const fbtn = mask.querySelector('#__kit_fbtn');
    if (fbtn) {
      fbtn.addEventListener('click', async () => {
        cache.clear();
        fbtn.disabled = true;
        fbtn.textContent = '刷新中';
        await refreshPages();
        fbtn.textContent = '刷新';
        fbtn.disabled = false;
      });
    }

    // 拖动改宽
    const grip = mask.querySelector('#__kit_grip');
    if (grip) {
      grip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = mask.getBoundingClientRect().width;
        const move = (ev) => applyWidth(startW + (ev.clientX - startX));
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          document.body.style.userSelect = '';
        };
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    }

    mask.addEventListener('click', (e) => {
      const t = e.target;
      const x = t.getAttribute && t.getAttribute('data-x');
      if (!x) return;
      if (x === 'close') return close();
      if (x === 'newpage') return newPage();
      if (x === 'back') {
        detailEl.classList.remove('on');
        mask.querySelector('.__kit-body').classList.remove('detail');
        return;
      }
      if (x === 'copy') {
        const tip = mask.querySelector('#__kit_tip');
        navigator.clipboard.writeText(dtaEl.value).then(
          () => {
            tip.textContent = '已复制';
            setTimeout(() => (tip.textContent = ''), 1400);
          },
          () => {
            dtaEl.select();
            tip.textContent = '请手动 Cmd+C';
          }
        );
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mask.classList.contains('on') && !mask.querySelector('.__kit-detail.on')) close();
    });

    // 编辑器里换页（顶部下拉）时，让列表高亮跟上
    let lastCur = '';
    setInterval(() => {
      if (!mask.classList.contains('on')) return;
      const v = document.getElementById('__kit_view_pages');
      if (!v || v.hidden) return;
      const cur = currentPageName();
      if (cur && cur !== lastCur) {
        lastCur = cur;
        renderPages();
      }
    }, 1200);
  }

  // ------------------------------------------------ 隐藏顶部两个入口
  // 顶部标签栏原本有：① 页面下拉按钮（"N 页面名 ▸ 取用 ⌄"）② 「组件 N」按钮。
  // 这两处入口都去掉，页面/组件的切换统一走左侧「面板」把手展开的面板。
  function hideTopEntries() {
    let done = 0;
    // ① 页面下拉：aria-label 含 ", N pages" 的按钮
    document.querySelectorAll('button[aria-label]').forEach((b) => {
      const label = b.getAttribute('aria-label') || '';
      if (/\d+\s*pages\b/i.test(label)) {
        if (b.style.display !== 'none') { b.style.display = 'none'; done++; }
      }
    });
    // ② 组件按钮：文字为「组件 N」（必须带数字）的顶部按钮；纯「组件」tab 不匹配
    document.querySelectorAll('button').forEach((b) => {
      const t = (b.textContent || '').trim();
      if (/^组件\s*\d+$/.test(t)) {
        if (b.style.display !== 'none') { b.style.display = 'none'; done++; }
      }
    });
    return done;
  }

  // 把面板入口嵌进编辑器工具栏，放到工具区容器「|」分隔线左侧（工具条首位）
  function mountHandleIntoToolbar() {
    const h = document.getElementById('__kit_handle');
    if (!h) return false;
    const toolsEl = document.getElementById('dc-toolbar-tools');
    const sel = document.querySelector('button[aria-label="Select"]')
      || document.querySelector('button[aria-label="Hand"]');
    if (!toolsEl && !sel) return false;
    const tools = toolsEl || (sel && sel.parentElement);
    if (!tools) return false;
    const slot = tools.parentElement || tools;                   // 工具组槽位
    const bar = slot.parentElement || slot;                      // 滚动容器
    // 插到槽位之前：☰ | Select ...
    if (h.parentElement !== bar || h.nextElementSibling !== slot) {
      bar.insertBefore(h, slot);
    }
    if (!h.classList.contains('in-toolbar')) h.classList.add('in-toolbar');
    h.title = '页面 / 组件面板';
    if (mask && mask.classList.contains('on')) positionPanel();
    return true;
  }

  function boot() {
    buildUI();
    window.addEventListener('pointerdown', onPageListPointerDown, true);
    window.addEventListener('mousedown', onPageListPointerDown, true);
    // 编辑器异步挂载 + React 可能重渲染，用 MutationObserver 持续兜底
    hideTopEntries();
    mountHandleIntoToolbar();
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (tries > 120) clearInterval(timer);
      hideTopEntries();
      mountHandleIntoToolbar();
    }, 400);
    const mo = new MutationObserver(() => {
      hideTopEntries();
      mountHandleIntoToolbar();
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    setTimeout(() => { try { mo.disconnect(); } catch (e) {} }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
