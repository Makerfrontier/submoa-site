// Live iframe preview for Atomic Email. Renders the project's current HTML
// in a sandboxed iframe and proxies click/hover events back to the parent
// via postMessage so field cards can scroll into view + pulse.
//
// The iframe document body has data-ae-field-id attributes on every editable
// element (the parser stamps them). We inject a tiny script that listens for
// clicks/hovers and posts the field id up. We also listen FOR messages from
// the parent telling us which field is "highlighted" — we add a temporary
// dashed amber outline in response.

import { useEffect, useRef } from 'react';

export default function HTMLPreview({
  html,
  width = 'desktop',
  theme = 'light',
  onFieldClick,
  onFieldHover,
  highlightedFieldId,
}) {
  const iframeRef = useRef(null);

  // Re-render the iframe whenever html / width / theme changes (debounced
  // upstream by AtomicEmail.jsx so we don't thrash on every keystroke).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = wrapForIframe(html || '<div style="padding:40px;color:#888;font-family:sans-serif">Import HTML to see preview</div>', theme);
  }, [html, theme]);

  // Listen for clicks/hovers from the iframe.
  useEffect(() => {
    function onMessage(e) {
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || !msg.__ae) return;
      if (msg.type === 'ae-click' && msg.field_id) onFieldClick?.(msg.field_id);
      if (msg.type === 'ae-hover' && msg.field_id) onFieldHover?.(msg.field_id);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onFieldClick, onFieldHover]);

  // Send highlight messages into the iframe.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ __ae: true, type: 'ae-highlight', field_id: highlightedFieldId || null }, '*');
  }, [highlightedFieldId]);

  const widthPx = width === 'mobile' ? 320 : 600;
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)', borderRadius: 6,
      overflow: 'hidden',
    }}>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 24, overflow: 'auto',
        background: theme === 'dark' ? '#15191F' : 'var(--surface-alt)',
        transition: 'background 200ms',
      }}>
        <iframe
          ref={iframeRef}
          title="Atomic Email preview"
          sandbox="allow-same-origin allow-scripts"
          style={{
            width: widthPx,
            minHeight: 600,
            background: '#fff',
            border: 0,
            boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
            borderRadius: 4,
            transition: 'width 200ms',
          }}
        />
      </div>
    </div>
  );
}

// Wraps the user's HTML with an injection script that handles click→postMessage,
// hover→postMessage, and parent→highlight messages. Keep the injection scoped
// to the iframe so it never touches exported HTML (export comes from the DB
// stripped via templater.stripInjections, which strips data-ae-* attrs).
function wrapForIframe(html, theme) {
  const themeStyles = theme === 'dark'
    ? `<style id="ae-theme">html,body{background:#1a1d24!important;color-scheme:dark}img{filter:brightness(0.95)}</style>`
    : '';
  // The script runs after DOMContentLoaded; we inject just before </body>.
  const injection = `<style>[data-ae-active="1"]{outline:2px dashed #E8843D!important;outline-offset:2px}</style><script>(function(){
  function findFieldId(t){let e=t;while(e&&e!==document.documentElement){if(e.getAttribute&&e.getAttribute('data-ae-field-id'))return e.getAttribute('data-ae-field-id');e=e.parentNode}return null}
  document.addEventListener('click',function(e){const id=findFieldId(e.target);if(id){e.preventDefault();e.stopPropagation();window.parent.postMessage({__ae:true,type:'ae-click',field_id:id},'*')}},true);
  document.addEventListener('mouseover',function(e){const id=findFieldId(e.target);if(id){window.parent.postMessage({__ae:true,type:'ae-hover',field_id:id},'*')}},true);
  let activeId=null;
  window.addEventListener('message',function(e){const m=e.data;if(!m||!m.__ae||m.type!=='ae-highlight')return;
    if(activeId){const old=document.querySelector('[data-ae-field-id="'+activeId+'"][data-ae-active="1"]');if(old)old.removeAttribute('data-ae-active')}
    activeId=m.field_id;if(activeId){const el=document.querySelector('[data-ae-field-id="'+activeId+'"]');if(el){el.setAttribute('data-ae-active','1');try{el.scrollIntoView({behavior:'smooth',block:'nearest'})}catch{}}}
  });
})();</script>`;
  // If the HTML has </body>, inject before it; else append.
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, themeStyles + injection + '</body>');
  return html + themeStyles + injection;
}
