import React, { useState } from 'react';
import { LogoFull } from './Icons';
import { getIconPath } from '../data/iconCatalog';
import { useMenu } from './MenuContext';

const GREEN = '#27ae60';

export default function MenuDrawer({
  user, userRole, availableItems = [], activeItem,
  onSwitchContext, onNavigate, unreadCount = 0,
}) {
  const { open, closeMenu } = useMenu();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const activeAvatarSrc = activeItem?.avatarCustom || (activeItem?.avatarIcon ? getIconPath(activeItem.avatarIcon) : null);

  const nav = (target) => { closeMenu(); onNavigate(target); };

  const items = [{ label: 'Профиль', icon: '👤', target: 'profile' }];
  items.push(
    { label: 'Мои курсы', icon: '📚', target: 'my_courses' },
    { label: 'Лист практик', icon: '🗂', target: 'library' },
    { label: 'Мои трекеры', icon: '🎯', target: 'my_trackers' },
    { label: 'Рекомендации', icon: '💡', target: 'recommendations' },
    { label: 'Вопрос тренеру', icon: '💬', target: 'ask' },
  );
  if (userRole === 'admin') items.push({ label: 'Назначить роль', icon: '🔑', target: 'assign_role' });

  return (
    <>
      {open && (
        <div onClick={closeMenu}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 200, backdropFilter: 'blur(4px)' }} />
      )}
      <div style={{
        position: 'fixed', top: 0, right: open ? 0 : -280, width: 270, height: '100%',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
        zIndex: 201, transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 24px 40px',
        boxShadow: open ? '-8px 0 40px rgba(0,0,0,0.08)' : 'none',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          {user?.avatar && <img src={user.avatar} alt="" style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover' }} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{user?.email}</div>
          </div>
        </div>

        {availableItems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setSwitcherOpen(!switcherOpen)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(39,174,96,0.06)', border: '1.5px solid rgba(39,174,96,0.15)',
              cursor: 'pointer', textAlign: 'left',
            }}>
              {activeAvatarSrc && <img src={activeAvatarSrc} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'contain' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeItem?.title || 'Выберите курс'}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>
                  {activeItem?.type === 'tracker' ? 'Трекер' : 'Курс'} · {activeItem?.daysCount || 0} дн.
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#888', transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {switcherOpen && (
              <div style={{
                marginTop: 4, borderRadius: 12, overflow: 'hidden',
                border: '1px solid rgba(0,0,0,0.06)', background: '#fff',
              }}>
                {availableItems.map(item => {
                  const isActive = item.id === activeItem?.id;
                  const src = item.avatarCustom || (item.avatarIcon ? getIconPath(item.avatarIcon) : null);
                  return (
                    <button key={`${item.type}-${item.id}`}
                      onClick={() => { onSwitchContext?.(item); setSwitcherOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', border: 'none',
                        background: isActive ? 'rgba(39,174,96,0.08)' : 'transparent',
                        cursor: 'pointer', textAlign: 'left',
                        borderBottom: '1px solid rgba(0,0,0,0.03)',
                      }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: isActive ? `2px solid ${GREEN}` : '1px solid rgba(0,0,0,0.06)',
                        padding: 2,
                      }}>
                        {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: 14 }}>{item.type === 'tracker' ? '🎯' : '📚'}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>
                          {item.type === 'tracker' ? 'Трекер' : 'Курс'} · {item.daysCount} дн. · {item.activities.length} практик
                        </div>
                      </div>
                      {isActive && <div style={{ width: 8, height: 8, borderRadius: 4, background: GREEN, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {items.map(item => (
          <button key={item.target} onClick={() => nav(item.target)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px', border: 'none', background: 'transparent', borderRadius: 12, fontSize: 15, fontWeight: 500, color: '#1a1a2e', cursor: 'pointer', textAlign: 'left', marginBottom: 4, position: 'relative' }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>{item.label}
            {item.target === 'ask' && unreadCount > 0 && (
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#e67e22', marginLeft: 'auto',
              }} />
            )}
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.04)', opacity: 0.5 }}>
          <LogoFull height={36} />
        </div>
      </div>
    </>
  );
}
