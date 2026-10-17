"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  MessageCircle,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./calendar-workspace.css";

type EventKind = "family" | "labor" | "civil" | "criminal";
type CalendarView = "day" | "week" | "month";

type CalendarEvent = {
  id: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  title: string;
  matter: string;
  kind: EventKind;
  location: string;
  details: string;
  attendees: string;
};

const sampleEvents: CalendarEvent[] = [
  {
    id: "event-bautista",
    date: "2024-09-16",
    startTime: "09:00",
    durationMinutes: 60,
    title: "R. Bautista",
    matter: "Family support consultation",
    kind: "family",
    location: "Meeting room 1",
    details: "Review the support agreement and confirm the documents needed for the next filing.",
    attendees: "R. Bautista, Atty. Dela Cruz, and intake associate",
  },
  {
    id: "event-firmas",
    date: "2024-09-16",
    startTime: "14:30",
    durationMinutes: 60,
    title: "Firmas Dev. Corp.",
    matter: "Civil contract review",
    kind: "civil",
    location: "Conference room 2",
    details: "Discuss the proposed revisions to the development agreement and outstanding clauses.",
    attendees: "Firmas representative and legal team",
  },
  {
    id: "event-santos",
    date: "2024-09-17",
    startTime: "10:00",
    durationMinutes: 60,
    title: "M. Santos",
    matter: "Labor case · Northstar Agency",
    kind: "labor",
    location: "Meeting room 1",
    details: "Prepare for the labor mediation and review the client’s timeline and supporting records.",
    attendees: "M. Santos, Atty. Dela Cruz, and case associate",
  },
  {
    id: "event-alcantara",
    date: "2024-09-17",
    startTime: "16:00",
    durationMinutes: 60,
    title: "R. Alcantara",
    matter: "Criminal defense · Case conference",
    kind: "criminal",
    location: "Private meeting room",
    details: "Review the next hearing date, evidence list, and questions for the client.",
    attendees: "R. Alcantara and defense counsel",
  },
  {
    id: "event-ramos",
    date: "2024-09-18",
    startTime: "11:30",
    durationMinutes: 60,
    title: "L. Ramos",
    matter: "Labor case · Benefits review",
    kind: "labor",
    location: "Video conference",
    details: "Check the benefits computation and agree on the documents to request from the employer.",
    attendees: "L. Ramos and case associate",
  },
  {
    id: "event-hernandez",
    date: "2024-09-19",
    startTime: "09:00",
    durationMinutes: 60,
    title: "T. Hernandez",
    matter: "Family matter · Case update",
    kind: "family",
    location: "Meeting room 3",
    details: "Share the latest filing update and confirm the client’s preferred next steps.",
    attendees: "T. Hernandez and Atty. Dela Cruz",
  },
  {
    id: "event-sy",
    date: "2024-09-19",
    startTime: "14:00",
    durationMinutes: 60,
    title: "K. Sy",
    matter: "Criminal defense · Evidence review",
    kind: "criminal",
    location: "Meeting room 2",
    details: "Walk through the evidence index and outline remaining review questions.",
    attendees: "K. Sy and defense counsel",
  },
  {
    id: "event-weekly-sync",
    date: "2024-09-20",
    startTime: "10:00",
    durationMinutes: 60,
    title: "Weekly sync",
    matter: "Labor and employment team",
    kind: "labor",
    location: "Main conference room",
    details: "Review open labor matters, upcoming deadlines, and follow-up assignments.",
    attendees: "Labor and employment team",
  },
];

const weekdays = [
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
  { short: "Sun", full: "Sunday" },
];

const eventKindLabels: Record<EventKind, string> = {
  family: "Family law",
  labor: "Labor law",
  civil: "Civil law",
  criminal: "Criminal law",
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCalendarDays(month: Date) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) =>
    new Date(month.getFullYear(), month.getMonth(), index - offset + 1),
  );
}

function getWeekdays(date: Date) {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 5 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

function formatClock(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function eventEndTime(event: CalendarEvent) {
  const [hour, minute] = event.startTime.split(":").map(Number);
  const endMinutes = hour * 60 + minute + event.durationMinutes;
  return formatClock(`${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`);
}

function CalendarEventTooltip({ event }: { event: CalendarEvent }) {
  const eventDate = new Date(`${event.date}T12:00:00`);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(eventDate);

  return (
    <div className="calendar-event-tooltip" id={`${event.id}-details`} role="tooltip">
      <div className="calendar-tooltip-heading">
        <span className={`calendar-tooltip-kind calendar-tooltip-kind--${event.kind}`}>{eventKindLabels[event.kind]}</span>
        <strong>{event.title}</strong>
      </div>
      <p className="calendar-tooltip-matter">{event.matter}</p>
      <p className="calendar-tooltip-description">{event.details}</p>
      <div className="calendar-tooltip-meta">
        <span><CalendarDays aria-hidden="true" size={9.38} />{dateLabel}</span>
        <span><Clock3 aria-hidden="true" size={9.38} />{formatClock(event.startTime)} – {eventEndTime(event)}</span>
        <span><MapPin aria-hidden="true" size={9.38} />{event.location}</span>
        <span><MessageCircle aria-hidden="true" size={9.38} />{event.attendees}</span>
      </div>
    </div>
  );
}

export default function CalendarWorkspace() {
  const demoToday = useMemo(() => new Date(2024, 8, 17), []);
  const [selectedDate, setSelectedDate] = useState(demoToday);
  const [view, setView] = useState<CalendarView>("week");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const eventsByDate = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = sampleEvents.filter((event) =>
      !query || `${event.title} ${event.matter} ${event.location} ${event.details} ${eventKindLabels[event.kind]}`.toLowerCase().includes(query),
    );
    const grouped = new Map<string, CalendarEvent[]>();

    for (const event of visible) {
      const key = event.date;
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [search]);

  const calendarDays = getCalendarDays(selectedDate);
  const weekdaysInView = getWeekdays(selectedDate);
  const visibleDays = view === "day" ? [selectedDate] : weekdaysInView;
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(selectedDate);
  const selectedDateKey = dateKey(selectedDate);

  const moveDate = (direction: -1 | 1) => {
    const nextDate = new Date(selectedDate);
    if (view === "month") {
      nextDate.setMonth(nextDate.getMonth() + direction);
    } else {
      nextDate.setDate(nextDate.getDate() + (view === "day" ? direction : direction * 7));
    }
    setSelectedDate(nextDate);
  };

  const goToToday = () => {
    setSelectedDate(demoToday);
  };

  const unavailable = (label: string) => setToast(`${label} is not part of this demo yet.`);
  const timeRows = [
    { label: "08:00 AM", minute: 0 },
    { label: "10:00 AM", minute: 120 },
    { label: "12:00 PM", minute: 240 },
    { label: "02:00 PM", minute: 360 },
    { label: "04:00 PM", minute: 480 },
    { label: "06:00 PM", minute: 600 },
  ];

  return (
    <WorkspaceShell
      activePage="Calendar"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={unavailable}
      searchPlaceholder="Search appointments and matters..."
      searchLabel="Search appointments and matters"
    >
      <main className="dashboard calendar-page">
        <div className="calendar-layout">
          <section className="calendar-panel calendar-schedule-panel" aria-label={`${view} calendar schedule`}>
            <div className="calendar-toolbar calendar-schedule-toolbar">
              <div className="calendar-month-switcher">
                <h1 aria-live="polite">{monthLabel}</h1>
                <button className="calendar-icon-button" type="button" aria-label={view === "month" ? "Previous month" : "Previous period"} onClick={() => moveDate(-1)}>
                  <ChevronLeft size={12.06} />
                </button>
                <button className="calendar-icon-button" type="button" aria-label={view === "month" ? "Next month" : "Next period"} onClick={() => moveDate(1)}>
                  <ChevronRight size={12.06} />
                </button>
              </div>
              <div className="calendar-toolbar-actions">
                <div className="calendar-view-tabs" role="group" aria-label="Calendar view">
                  {(["day", "week", "month"] as const).map((option) => (
                    <button
                      className={view === option ? "is-active" : ""}
                      type="button"
                      key={option}
                      aria-pressed={view === option}
                      onClick={() => setView(option)}
                    >
                      {option[0].toUpperCase() + option.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="calendar-today-button" type="button" onClick={goToToday}>Today</button>
              </div>
            </div>

            {view === "week" && (
              <div className="calendar-mobile-day-picker" role="group" aria-label="Choose a weekday">
                {weekdaysInView.map((date) => {
                  const key = dateKey(date);
                  const weekday = weekdays[(date.getDay() + 6) % 7];
                  const isToday = key === dateKey(demoToday);

                  return (
                    <button
                      className={`${key === selectedDateKey ? "is-selected" : ""}${isToday ? " is-today" : ""}`}
                      type="button"
                      key={key}
                      aria-pressed={key === selectedDateKey}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span>{weekday.short}</span>
                      <strong>{date.getDate()}</strong>
                    </button>
                  );
                })}
              </div>
            )}

            {view === "month" ? (
              <div className="calendar-month-scroll">
                <div className="calendar-month-grid" aria-label="Month calendar">
                  {weekdays.map((weekday) => <div className="calendar-month-weekday" key={weekday.full}>{weekday.short}</div>)}
                  {calendarDays.map((date) => {
                    const key = dateKey(date);
                    const events = eventsByDate.get(key) ?? [];
                    const isToday = key === dateKey(demoToday);

                    return (
                      <div className={`calendar-month-cell${date.getMonth() === selectedDate.getMonth() ? "" : " is-outside"}`} key={key}>
                        <button
                          className={`calendar-month-date${isToday ? " is-today" : ""}${key === selectedDateKey ? " is-selected" : ""}`}
                          type="button"
                          aria-label={`Select ${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date)}`}
                          onClick={() => { setSelectedDate(date); setView("day"); }}
                        >
                          {date.getDate()}
                        </button>
                        <div className="calendar-month-events">
                          {events.map((event) => (
                            <article className={`calendar-month-event calendar-month-event--${event.kind}`} key={event.id}>
                              <button type="button" aria-describedby={`${event.id}-details`}>
                                <span>{formatClock(event.startTime)}</span> {event.title}
                              </button>
                              <CalendarEventTooltip event={event} />
                            </article>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="calendar-schedule-scroll">
                <div
                  className={`calendar-week-schedule${view === "day" ? " is-day-view" : ""}`}
                  data-selected-day={Math.min((selectedDate.getDay() + 6) % 7, 4)}
                >
                  <div className="calendar-week-head">
                    <div className="calendar-time-gutter" aria-hidden="true" />
                    {visibleDays.map((date) => {
                      const key = dateKey(date);
                      const isToday = key === dateKey(demoToday);
                      const weekday = weekdays[(date.getDay() + 6) % 7];

                      return (
                        <button
                          className={`calendar-weekday-heading${isToday ? " is-today" : ""}${key === selectedDateKey ? " is-selected" : ""}`}
                          type="button"
                          key={key}
                          aria-pressed={key === selectedDateKey}
                          onClick={() => setSelectedDate(date)}
                        >
                          <span>{weekday.short}{isToday && <strong> (Today)</strong>}</span>
                          <b>{date.getDate()}</b>
                        </button>
                      );
                    })}
                  </div>
                  <div className="calendar-week-body">
                    <div className="calendar-time-axis" aria-hidden="true">
                      {timeRows.map((row) => (
                        <span key={row.label} style={{ top: `${row.minute / 600 * 100}%` }}>{row.label}</span>
                      ))}
                    </div>
                    <div className="calendar-day-columns">
                      {visibleDays.map((date) => {
                        const key = dateKey(date);
                        const events = eventsByDate.get(key) ?? [];
                        const isToday = key === dateKey(demoToday);

                        return (
                          <div className={`calendar-day-column${isToday ? " is-today" : ""}`} key={key}>
                            {events.map((event) => {
                              const [hour, minute] = event.startTime.split(":").map(Number);
                              const minutesFromStart = hour * 60 + minute - 8 * 60;

                              return (
                                <article
                                  className={`calendar-schedule-event calendar-schedule-event--${event.kind}`}
                                  key={event.id}
                                  style={{ top: `${minutesFromStart / 600 * 100}%` }}
                                >
                                  <button type="button" aria-describedby={`${event.id}-details`}>
                                    <strong>{formatClock(event.startTime)}</strong>
                                    <span>{event.title}</span>
                                    <small>{eventKindLabels[event.kind].replace(" law", "").toUpperCase()} (3 SP)</small>
                                  </button>
                                  <CalendarEventTooltip event={event} />
                                </article>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <p className="calendar-sample-note">Sample schedule · Local demo data only</p>
          </section>

          <aside className="calendar-reference-rail" aria-label="Calendar updates">
            <section className="calendar-rail-card" aria-labelledby="recent-messages-heading">
              <div className="calendar-rail-heading">
                <h2 id="recent-messages-heading">Recent Messages</h2>
              </div>
              <div className="calendar-recent-messages">
                <article>
                  <div><strong>Client Case #0847</strong><time>4m ago</time></div>
                  <p>U-upload ko po ba ito dito?</p>
                </article>
                <article>
                  <div><strong>Atty. Clara Ocampo</strong><time>1h ago</time></div>
                  <p>The Cebu Court hearing has been moved to March 1st morning.</p>
                </article>
                <article>
                  <div><strong>Client Case #0839</strong><time>3h ago</time></div>
                  <p>They sent another demanding message today. Screenshot sa...</p>
                </article>
              </div>
            </section>

            <section className="calendar-rail-card calendar-stats-card" aria-labelledby="quick-stats-heading">
              <div className="calendar-rail-heading">
                <h2 id="quick-stats-heading">Quick Stats</h2>
              </div>
              <dl className="calendar-quick-stats">
                <div><dt>This Week’s Consultations</dt><dd>8 Scheduled</dd></div>
                <div><dt>New Intake Requests</dt><dd className="is-urgent">3 Pending</dd></div>
                <div><dt>Completed Follow-ups</dt><dd>5 Checked</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      </main>
      {toast && (
        <div className="toast calendar-toast" role="status">
          <span className="toast-check"><Check size={10.72} /></span>
          <span>{toast}</span>
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={10.72} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
