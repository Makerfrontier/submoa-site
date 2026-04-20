// Renders a single block in the canvas. Produces the designed HTML via the
// block def's render() function and wraps it with editor affordances
// (selection outline, label chip, lock badge).

import { getBlockDef } from '../blocks';

export function BlockRenderer({ block, brand, isSelected, isHovered, onSelect, onHover }) {
  const def = getBlockDef(block.type);

  let html;
  if (block.screenshotUrl) {
    html = `<img src="${String(block.screenshotUrl).replace(/"/g, '&quot;')}" style="width:100%;display:block;" alt="" />`;
  } else if (def) {
    try {
      html = def.render(block.fields || {}, brand);
    } catch (e) {
      html = `<div style="padding:40px;text-align:center;color:#999;background:#f5f5f5;font-family:system-ui,sans-serif;">Block render error: ${String(e && e.message || e)}</div>`;
    }
  } else {
    html = `<div style="padding:40px;text-align:center;color:#999;background:#f5f5f5;font-family:system-ui,sans-serif;">Unknown block type: ${block.type}</div>`;
  }

  return (
    <div
      data-block-id={block.id}
      onClick={(e) => { e.stopPropagation(); onSelect(block.id); }}
      onMouseEnter={() => onHover?.(block.id)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        position: 'relative',
        outline: isSelected
          ? '2px solid #2A5A6A'
          : isHovered
          ? '1px solid rgba(42,90,106,0.4)'
          : 'none',
        outlineOffset: isSelected ? 2 : 1,
        cursor: 'pointer',
        transition: 'outline 0.1s',
      }}
    >
      {(isSelected || isHovered) && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 100,
          display: 'flex', gap: 6, pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(42,90,106,0.92)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: 4,
            fontFamily: 'DM Sans, sans-serif',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>{def?.label || block.type}</div>
        </div>
      )}

      {block.locked && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          fontSize: 11, padding: '3px 8px', borderRadius: 4,
          fontFamily: 'DM Sans, sans-serif', pointerEvents: 'none',
        }}>🔒 Locked</div>
      )}

      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
