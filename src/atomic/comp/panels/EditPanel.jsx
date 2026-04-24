// Left sidebar for the Atomic Comp editor. Two modes:
//   - no selection → block list with drag-to-reorder + "+ Add" button
//   - block selected → field editors for that block + lock/delete actions
// A search-driven block picker overlay sits on top when Add is clicked.

import { useState } from 'react';
import { BLOCK_REGISTRY, BLOCK_CATEGORIES, getBlockDef } from '../blocks';
import { FieldEditor } from './fields';
import { BrandPanel } from './BrandPanel';

const LABEL_UPPER = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-mid)',
  fontFamily: 'DM Sans, sans-serif',
};

const BTN_GHOST = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'DM Sans, sans-serif',
  color: 'var(--text)',
  cursor: 'pointer',
};

const BTN_AMBER = {
  background: 'var(--amber)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
};

function previewText(block) {
  const keys = ['headline', 'text', 'quote', 'name', 'tagline', 'src', 'html', 'eyebrow'];
  for (const k of keys) {
    const v = block.fields?.[k];
    if (v) return String(v).slice(0, 60);
  }
  return '';
}

function BlockListRow({ block, onSelect, onReorderStart, onReorderOver, onReorderDrop, dragOverId, draggingId }) {
  const def = getBlockDef(block.type);
  const isDragOver = dragOverId === block.id && draggingId !== block.id;
  return (
    <div
      data-row-id={block.id}
      draggable
      onDragStart={(e) => { onReorderStart(block.id); try { e.dataTransfer.setData('text/plain', block.id); } catch {} }}
      onDragOver={(e) => { e.preventDefault(); onReorderOver(block.id); }}
      onDrop={(e) => { e.preventDefault(); onReorderDrop(block.id); }}
      onClick={() => onSelect(block.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        cursor: 'pointer',
        borderTop: isDragOver ? '3px solid var(--amber)' : '1px solid var(--border)',
        opacity: draggingId === block.id ? 0.4 : 1,
        transition: 'opacity 0.12s',
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-mid)', cursor: 'grab', userSelect: 'none', width: 14 }}>⠿</span>
      <span style={{ fontSize: 14, color: 'var(--text-mid)', width: 20, textAlign: 'center' }}>{def?.icon || '·'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          fontFamily: 'DM Sans, sans-serif',
        }}>{def?.label || block.type}</div>
        {previewText(block) && (
          <div style={{
            fontSize: 11, color: 'var(--text-mid)',
            fontFamily: 'DM Sans, sans-serif',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{previewText(block)}</div>
        )}
      </div>
      {block.locked && <span title="Locked" style={{ fontSize: 12 }}>🔒</span>}
    </div>
  );
}

function BlockList({ blocks, onSelect, onReorder }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {blocks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          color: 'var(--text-mid)', fontSize: 13,
          fontFamily: 'DM Sans, sans-serif',
        }}>No blocks yet.<br />Click + Add to start.</div>
      )}
      {blocks.map((b) => (
        <BlockListRow
          key={b.id}
          block={b}
          onSelect={onSelect}
          onReorderStart={(id) => { setDraggingId(id); setDragOverId(null); }}
          onReorderOver={(id) => setDragOverId(id)}
          onReorderDrop={(targetId) => {
            if (draggingId && targetId !== draggingId) onReorder(draggingId, targetId);
            setDraggingId(null); setDragOverId(null);
          }}
          draggingId={draggingId}
          dragOverId={dragOverId}
        />
      ))}
    </div>
  );
}

function BlockEditFields({ block, brand, onUpdateField, onDelete, onToggleLock }) {
  const def = getBlockDef(block.type);
  if (!def) return <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>Unknown block type: {block.type}</div>;

  if (block.locked) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 13, color: 'var(--text-mid)', fontFamily: 'DM Sans, sans-serif', marginBottom: 16 }}>
          This block is locked
        </div>
        <button onClick={onToggleLock} style={BTN_GHOST}>Unlock</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {def.fields.map((f) => (
        <FieldEditor
          key={f.key}
          fieldDef={f}
          value={block.fields?.[f.key] ?? f.default ?? ''}
          brand={brand}
          onChange={(v) => onUpdateField(block.id, f.key, v)}
        />
      ))}
      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 14, marginTop: 4,
        display: 'flex', gap: 8,
      }}>
        <button onClick={onToggleLock} style={BTN_GHOST}>🔒 Lock</button>
        <button onClick={onDelete} style={{ ...BTN_GHOST, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
}

function BlockPickerItem({ type, def, onSelect }) {
  return (
    <button
      onClick={() => onSelect(type)}
      style={{
        width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg)', cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ fontSize: 18, width: 24, textAlign: 'center', color: 'var(--text-mid)' }}>{def.icon}</span>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{def.label}</div>
    </button>
  );
}

function BlockPickerDrawer({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q
    ? Object.entries(BLOCK_REGISTRY).filter(([type, def]) =>
        def.label.toLowerCase().includes(q) || type.includes(q))
    : null;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--card)', zIndex: 200,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={LABEL_UPPER}>Add Block</span>
          <button onClick={onClose} style={{ ...BTN_GHOST, padding: '4px 10px' }}>✕</button>
        </div>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search blocks..."
          style={{
            width: '100%',
            background: 'var(--surface-inp)',
            border: '1px solid var(--border)',
            borderRadius: 6, padding: '8px 10px',
            fontSize: 13, fontFamily: 'DM Sans, sans-serif',
            color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {filtered ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-mid)', textAlign: 'center', padding: 20 }}>
                No blocks match “{search}”.
              </div>
            )}
            {filtered.map(([type, def]) => (
              <BlockPickerItem key={type} type={type} def={def} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          BLOCK_CATEGORIES.map((cat) => (
            <div key={cat.label} style={{ marginBottom: 20 }}>
              <div style={{ ...LABEL_UPPER, fontSize: 10, marginBottom: 8, letterSpacing: '0.12em' }}>
                {cat.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cat.blocks.map((type) => {
                  const def = getBlockDef(type);
                  if (!def) return null;
                  return <BlockPickerItem key={type} type={type} def={def} onSelect={onSelect} />;
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TabButton({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: active ? 'var(--bg)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--amber)' : '2px solid transparent',
        padding: '10px 0',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: active ? 'var(--text)' : 'var(--text-mid)',
        fontFamily: 'DM Sans, sans-serif',
        cursor: 'pointer',
      }}
    >{label}</button>
  );
}

export function EditPanel({
  blocks, selectedId, brand,
  onSelectBlock, onUpdateField, onAddBlock,
  onDeleteBlock, onToggleLock, onReorder,
  onBrandUpdate,
}) {
  const selectedBlock = blocks.find((b) => b.id === selectedId);
  const [showPicker, setShowPicker] = useState(false);
  const [activeTab, setActiveTab] = useState('blocks'); // 'blocks' | 'brand'

  // Selecting a block forces us back to the Blocks tab so field editors show.
  const showTabs = !selectedBlock;
  const tab = selectedBlock ? 'blocks' : activeTab;

  return (
    <div style={{
      width: 320, minWidth: 320, maxWidth: 320,
      height: '100%',
      background: 'var(--card)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {showTabs && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
        }}>
          <TabButton active={tab === 'blocks'} label="Blocks" onClick={() => setActiveTab('blocks')} />
          <TabButton active={tab === 'brand'}  label="Brand"  onClick={() => setActiveTab('brand')} />
        </div>
      )}

      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10,
      }}>
        {selectedBlock ? (
          <>
            <button onClick={() => onSelectBlock(null)} style={{ ...BTN_GHOST, padding: '4px 10px' }}>← Blocks</button>
            <span style={LABEL_UPPER}>
              {getBlockDef(selectedBlock.type)?.label || selectedBlock.type}
            </span>
          </>
        ) : tab === 'blocks' ? (
          <>
            <span style={LABEL_UPPER}>Blocks ({blocks.length})</span>
            <button onClick={() => setShowPicker(true)} style={BTN_AMBER}>+ Add</button>
          </>
        ) : (
          <span style={LABEL_UPPER}>Brand config</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {selectedBlock ? (
          <BlockEditFields
            block={selectedBlock}
            brand={brand}
            onUpdateField={onUpdateField}
            onDelete={() => onDeleteBlock(selectedBlock.id)}
            onToggleLock={() => onToggleLock(selectedBlock.id)}
          />
        ) : tab === 'blocks' ? (
          <BlockList blocks={blocks} onSelect={onSelectBlock} onReorder={onReorder} />
        ) : (
          <BrandPanel brand={brand} onBrandUpdate={onBrandUpdate} />
        )}
      </div>

      {showPicker && (
        <BlockPickerDrawer
          onSelect={(type) => { onAddBlock(type); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
