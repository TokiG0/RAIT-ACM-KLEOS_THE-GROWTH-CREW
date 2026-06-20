import React, { useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, AlertTriangle,
  Clock, Info, Bell, CheckCircle2, FileWarning, MessageCircle, Phone,
} from 'lucide-react';
import { TRANSLATIONS } from '../utils/translations';

/* ─── static data ─── */
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// Deadlines that always fall in a displayed month
const DEADLINE_DEFS = [
  {
    id: 'gstr1', name: 'GSTR-1', day: 11,
    desc: 'Outward supply returns', color: '#FACC15',
    colorVar: 'var(--yellow)', section: 'Sec 37 CGST',
    penalty: '₹50/day · Max ₹10,000', penaltyNil: '₹20/day nil return',
    who: 'All registered taxpayers with outward supplies',
  },
  {
    id: 'gstr2b', name: 'GSTR-2B', day: 14,
    desc: 'Auto-generated ITC statement', color: '#38BDF8',
    colorVar: 'var(--blue)', section: 'Rule 60 CGST',
    penalty: 'System-generated — no penalty', penaltyNil: '',
    who: 'View-only — auto-populated by GSTN',
  },
  {
    id: 'gstr3b', name: 'GSTR-3B', day: 20,
    desc: 'Monthly summary return + tax payment', color: '#F87171',
    colorVar: 'var(--red)', section: 'Sec 39 CGST',
    penalty: '₹50/day · Max ₹10,000', penaltyNil: '₹20/day nil return',
    who: 'All registered taxpayers (turnover > ₹20 L)',
  },
  {
    id: 'gstr9', name: 'GSTR-9', day: 31,
    desc: 'Annual return (December only)', color: '#C084FC',
    colorVar: '#C084FC', section: 'Sec 44 CGST',
    penalty: '0.25% of turnover per day', penaltyNil: '',
    who: 'All taxpayers with turnover > ₹2 Cr',
    onlyMonth: 11, // December (0-indexed)
  },
];

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function firstDayOfMonth(y, m) {
  return new Date(y, m, 1).getDay(); // 0=Sun
}

function daysLeft(y, m, d) {
  const target = new Date(y, m, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / 86400000);
}

function buildCalendarReminder(dl, days, dateStr, lang) {
  const urgencyLine = days >= 0
    ? (lang === 'hi' ? `⏰ ${days} दिन शेष` : lang === 'hing' ? `⏰ ${days} din bache hain` : `⏰ ${days} days remaining`)
    : (lang === 'hi' ? '⚠️ समय सीमा बीत गई!' : lang === 'hing' ? '⚠️ Deadline nikal gayi!' : '⚠️ OVERDUE – file immediately!');

  const msgs = {
    en:
`📋 GST Filing Reminder

Form: ${dl.name} — ${dl.desc}
Due Date: ${dateStr}
${urgencyLine}

Penalty if missed: ${dl.penalty}${dl.penaltyNil ? `\nNil return penalty: ${dl.penaltyNil}` : ''}
Who must file: ${dl.who}

Please file your ${dl.name} on time to avoid late fees and interest charges.

Sent via PocketCA – GST Assistant`,

    hi:
`📋 GST फाइलिंग रिमाइंडर

फॉर्म: ${dl.name} — ${dl.desc}
अंतिम तिथि: ${dateStr}
${urgencyLine}

विलंब पर जुर्माना: ${dl.penalty}
${dl.penaltyNil ? `शून्य रिटर्न: ${dl.penaltyNil}\n` : ''}
कृपया समय पर ${dl.name} दाखिल करें।

PocketCA – GST सहायक`,

    hing:
`📋 GST Filing Reminder

Form: ${dl.name} — ${dl.desc}
Last Date: ${dateStr}
${urgencyLine}

Late fee: ${dl.penalty}${dl.penaltyNil ? `\nNil return: ${dl.penaltyNil}` : ''}

Please ${dl.name} time par file karein, warna late fees aur interest lagega.

PocketCA – GST Assistant`,
  };
  return msgs[lang] || msgs.en;
}

export default function GstCalendar({ currentLang }) {
  const t = TRANSLATIONS[currentLang];
  const today = new Date();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDl, setSelectedDl] = useState(null);
  const [reminderPhone, setReminderPhone] = useState('');

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const sendWaReminder = (dl) => {
    const days = daysLeft(viewYear, viewMonth, dl.day);
    const dateStr = `${dl.day} ${MONTH_NAMES[viewMonth]} ${viewYear}`;
    const msg = buildCalendarReminder(dl, days, dateStr, currentLang);
    const phone = reminderPhone.replace(/\D/g, '');
    const url = phone.length === 10
      ? `https://api.whatsapp.com/send?phone=91${phone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Deadlines visible in this month
  const visibleDeadlines = useMemo(() =>
    DEADLINE_DEFS.filter(dl =>
      dl.onlyMonth === undefined || dl.onlyMonth === viewMonth
    )
  , [viewMonth]);

  // Map day→deadline for quick calendar lookup
  const deadlineByDay = useMemo(() => {
    const map = {};
    visibleDeadlines.forEach(dl => { map[dl.day] = dl; });
    return map;
  }, [visibleDeadlines]);

  // Build calendar grid cells (padding + days)
  const totalDays = daysInMonth(viewYear, viewMonth);
  const firstDay = firstDayOfMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const isToday = (d) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  return (
    <div className="gstcal-container">

      {/* ── Header ── */}
      <div className="gstcal-header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="gstcal-icon-wrap">
            <Calendar size={20} color="var(--blue)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t.calTitle}</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.calSubtitle}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="cal-nav-btn" onClick={prevMonth}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: 140, textAlign: 'center' }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button className="cal-nav-btn" onClick={nextMonth}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="gstcal-body">

        {/* ── Calendar Grid ── */}
        <div className="gstcal-grid-panel glass-panel">
          {/* Day-of-week headers */}
          <div className="cal-dow-row">
            {DAY_ABBR.map(d => (
              <div key={d} className="cal-dow-cell">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="cal-days-grid">
            {cells.map((day, i) => {
              const dl = day ? deadlineByDay[day] : null;
              const todayFlag = day ? isToday(day) : false;
              const dl2 = dl ? daysLeft(viewYear, viewMonth, day) : null;
              const urgent = dl2 !== null && dl2 >= 0 && dl2 <= 5;
              const past   = dl2 !== null && dl2 < 0;

              return (
                <div
                  key={i}
                  className={[
                    'cal-day-cell',
                    !day ? 'cal-day-empty' : '',
                    todayFlag ? 'cal-day-today' : '',
                    dl ? 'cal-day-has-deadline' : '',
                    urgent ? 'cal-day-urgent' : '',
                    past   ? 'cal-day-past'   : '',
                    selectedDl?.day === day ? 'cal-day-selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => dl && setSelectedDl(selectedDl?.id === dl.id ? null : dl)}
                  style={dl ? { cursor: 'pointer' } : {}}
                >
                  {day && <span className="cal-day-num">{day}</span>}
                  {dl && (
                    <div className="cal-deadline-dot-row">
                      <span
                        className="cal-deadline-dot"
                        style={{ background: past ? 'var(--text-muted)' : dl.color }}
                        title={dl.name}
                      />
                    </div>
                  )}
                  {dl && (
                    <span
                      className="cal-deadline-label"
                      style={{ color: past ? 'var(--text-muted)' : dl.color }}
                    >
                      {dl.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="gstcal-sidebar">

          {/* Detail card for selected deadline */}
          {selectedDl && (
            <div className="cal-detail-card glass-panel" style={{ borderLeft: `3px solid ${selectedDl.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Bell size={16} style={{ color: selectedDl.color }} />
                <h4 style={{ margin: 0, fontSize: '1rem', color: selectedDl.color }}>{selectedDl.name}</h4>
                <button
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }}
                  onClick={() => setSelectedDl(null)}
                >×</button>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0 0 8px' }}>{selectedDl.desc}</p>
              <div className="cal-detail-rows">
                <div className="cal-detail-row"><Info size={13} /><span><b>Due date:</b> {selectedDl.day} {MONTH_NAMES[viewMonth]}</span></div>
                <div className="cal-detail-row"><FileWarning size={13} /><span><b>Section:</b> {selectedDl.section}</span></div>
                <div className="cal-detail-row"><AlertTriangle size={13} style={{ color: 'var(--yellow)' }} /><span><b>Penalty:</b> {selectedDl.penalty}</span></div>
                {selectedDl.penaltyNil && (
                  <div className="cal-detail-row"><AlertTriangle size={13} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)' }}>Nil return: {selectedDl.penaltyNil}</span></div>
                )}
                <div className="cal-detail-row"><CheckCircle2 size={13} style={{ color: 'var(--green)' }} /><span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{selectedDl.who}</span></div>
              </div>
            </div>
          )}

          {/* Upcoming deadlines */}
          <div className="glass-panel" style={{ padding: 18 }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              {t.calUpcoming}
            </p>

            {/* WhatsApp reminder phone input */}
            <div className="cal-wa-panel">
              <div className="cal-wa-row">
                <Phone size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <input
                  className="cal-wa-input"
                  type="tel"
                  maxLength={10}
                  placeholder={t.calWaPhone || 'Recipient phone (10 digits)'}
                  value={reminderPhone}
                  onChange={e => setReminderPhone(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <p className="cal-wa-hint">{t.calWaHint || 'Optional — leave blank to open WhatsApp without pre-filling number'}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleDeadlines.map(dl => {
                const days = daysLeft(viewYear, viewMonth, dl.day);
                const past = days < 0;
                const urgent = !past && days <= 5;
                return (
                  <div
                    key={dl.id}
                    className="cal-upcoming-item"
                    style={{ borderLeft: `3px solid ${past ? 'var(--text-muted)' : dl.color}`, cursor: 'pointer', opacity: past ? 0.6 : 1 }}
                    onClick={() => setSelectedDl(selectedDl?.id === dl.id ? null : dl)}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: past ? 'var(--text-muted)' : dl.color }}>{dl.name}</p>
                      <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{dl.desc}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {past ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Filed</span>
                      ) : (
                        <>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: urgent ? 'var(--red)' : dl.color, lineHeight: 1 }}>
                              {days}d
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{dl.day} {MONTH_NAMES[viewMonth].slice(0, 3)}</div>
                          </div>
                          <button
                            className="cal-wa-remind-btn"
                            style={{ borderColor: dl.color, color: dl.color }}
                            title={t.calWaSend || 'Send Reminder via WhatsApp'}
                            onClick={e => { e.stopPropagation(); sendWaReminder(dl); }}
                          >
                            <MessageCircle size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Late filing penalty reference */}
          <div className="glass-panel" style={{ padding: 18 }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {t.calPenaltyRef}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'GSTR-1 Late Fee', val: '₹50/day · Max ₹10,000', color: 'var(--yellow)' },
                { label: 'GSTR-3B Late Fee', val: '₹50/day · Max ₹10,000', color: 'var(--red)' },
                { label: 'Nil Return', val: '₹20/day · Max ₹500', color: 'var(--text-muted)' },
                { label: 'Interest on Tax', val: '18% p.a. on unpaid tax', color: 'var(--orange-accent)' },
                { label: 'GSTR-9 Late Fee', val: '0.25% of turnover/day', color: '#C084FC' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ color: row.color, fontWeight: 600 }}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
