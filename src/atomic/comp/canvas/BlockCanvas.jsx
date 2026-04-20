// The scrollable canvas. Lays out every block top-to-bottom, handles
// selection (click block / click background), and supports HTML5 drag to
// reorder.

import { useState } from 'react';
import { BlockRenderer } from './BlockRenderer';

export function BlockCanvas({ blocks, brand, selectedId, onSelect, onReorder }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [dragState, setDragState] = useState(null); // { draggingId, overId }

  const onDragStart = (e, id) => {
    setDragState({ draggingId: id, overId: null });
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch {}
  };
  const onDragOver = (e, id) => {
    e.preventDefault();
    if (dragState && dragState.draggingId && dragState.draggingId !== id) {
      if (dragState.overId !== id) setDragState((p) => ({ ...p, overId: id }));
    }
  };
  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (dragState && dragState.draggingId && targetId !== dragState.draggingId) {
      onReorder(dragState.draggingId, targetId);
    }
    setDragState(null);
  };
  const onDragEnd = () => setDragState(null);

  return (
    <div
      onClick={() => onSelect(null)}
      style={{ minHeight: '100%', background: '#fff' }}
    >
      {blocks.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 400, color: '#999',
          fontFamily: 'DM Sans, sans-serif',
        }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🧩</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Add a block to get started</div>
          <div style={{ fontSize: 13, marginTop: 8, color: '#aaa' }}>Use the + Add button on the left</div>
        </div>
      )}

      {blocks.map((block) => (
        <div
          key={block.id}
          draggable
          onDragStart={(e) => onDragStart(e, block.id)}
          onDragOver={(e) => onDragOver(e, block.id)}
          onDrop={(e) => onDrop(e, block.id)}
          onDragEnd={onDragEnd}
          style={{
            opacity: dragState?.draggingId === block.id ? 0.5 : 1,
            borderTop: dragState?.overId === block.id
              ? '3px solid #2A5A6A'
              : '3px solid transparent',
          }}
        >
          <BlockRenderer
            block={block}
            brand={brand}
            isSelected={selectedId === block.id}
            isHovered={hoveredId === block.id}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        </div>
      ))}
    </div>
  );
}
