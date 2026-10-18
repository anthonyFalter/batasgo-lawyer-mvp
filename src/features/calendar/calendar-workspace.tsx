"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./calendar-workspace.css";

type EventKind = "family" | "labor" | "civil" | "criminal" | "intake";
type CalendarView = "day" | "week" | "month";
type CalendarSource = "manual" | "intake";

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
  source?: CalendarSource;
  intakeId?: string | null;
};

type CalendarDraft = {
  title: string;
  matter: string;
  kind: EventKind;
  date: string;
  startTime: string;
  durationMinutes: number;
  location: string;
  details: string;
  attendees: string;
};

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
  intake: "Intake follow-up",
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function createEmptyDraft(date: Date): CalendarDraft {
  return {
    title: "",
    matter: "",
    kind: "labor",
    date: dateKey(date),
    startTime: "09:00",
    durationMinutes: 60,
    location: "",
    details: "",
    attendees: "",
  };
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
  return Array.from({ length: 7 }, (_, index) => {
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
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [view, setView] = useState<CalendarView>("week");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarDraft>(createEmptyDraft(today));
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  const loadEvents = async () => {
    setIsLoadingEvents(true);
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load calendar events.");
      const payload = (await response.json()) as { events?: CalendarEvent[] };
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch {
      setToast("Unable to load the workspace calendar.");
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const eventsByDate = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = events.filter((event) =>
      !query || `${event.title} ${event.matter} ${event.location} ${event.details} ${eventKindLabels[event.kind]}`.toLowerCase().includes(query),
    );
    const grouped = new Map<string, CalendarEvent[]>();

    for (const event of visible) {
      grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    }
    return grouped;
  }, [events, search]);

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
    setSelectedDate(today);
  };

  const openCreateEvent = () => {
    setEditingEventId(null);
    setDraft(createEmptyDraft(selectedDate));
    setIsModalOpen(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setDraft({
      title: event.title,
      matter: event.matter,
      kind: event.kind,
      date: event.date,
      startTime: event.startTime,
      durationMinutes: event.durationMinutes,
      location: event.location,
      details: event.details,
      attendees: event.attendees,
    });
    setIsModalOpen(true);
  };

  const saveEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingEvent(true);
    try {
      const payload = {
        title: draft.title.trim(),
        matter: draft.matter.trim(),
        kind: draft.kind,
        date: draft.date,
        startTime: draft.startTime,
        durationMinutes: Number(draft.durationMinutes),
        location: draft.location.trim(),
        details: draft.details.trim(),
        attendees: draft.attendees.trim(),
      };

      const url = editingEventId ? `/api/calendar/${editingEventId}` : "/api/calendar";
      const method = editingEventId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.json().catch(() => ({ error: "Unable to save the calendar event." }));
        throw new Error(message.error || "Unable to save the calendar event.");
      }

      const result = (await response.json()) as { event?: CalendarEvent };
      const savedEvent = result.event;
      if (!savedEvent) throw new Error("The calendar service did not return a saved event.");

      setEvents((current) => {
        if (editingEventId) {
          return current.map((item) => item.id === savedEvent.id ? savedEvent : item);
        }
        return [savedEvent, ...current];
      });
      setIsModalOpen(false);
      setToast(editingEventId ? "Event updated." : "Event added to your calendar.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save the calendar event.");
    } finally {
      setIsSavingEvent(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (eventId.startsWith("intake-")) {
      setToast("This intake reminder is generated automatically and can’t be removed manually.");
      return;
    }

    try {
      const response = await fetch(`/api/calendar/${eventId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete the event.");
      setEvents((current) => current.filter((item) => item.id !== eventId));
      setToast("Event deleted.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to delete the event.");
    }
  };

  const unavailable = (label: string) => setToast(label === "Document Assembly"
    ? "This feature is not currently part of the MVP."
    : `${label} is not part of this demo yet.`);
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
                <div className="calendar-actions-inline">
                  <button className="calendar-today-button" type="button" onClick={goToToday}>Today</button>
                  <button className="calendar-create-button" type="button" onClick={openCreateEvent}>
                    <Plus size={10.72} />
                    Add event
                  </button>
                </div>
              </div>
            </div>

            {view === "week" && (
              <div className="calendar-mobile-day-picker" role="group" aria-label="Choose a weekday">
                {weekdaysInView.map((date) => {
                  const key = dateKey(date);
                  const weekday = weekdays[(date.getDay() + 6) % 7];
                  const isToday = key === dateKey(today);

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

            {isLoadingEvents ? (
              <p className="calendar-loading" role="status">Loading calendar events…</p>
            ) : view === "month" ? (
              <div className="calendar-month-scroll">
                <div className="calendar-month-grid" aria-label="Month calendar">
                  {weekdays.map((weekday) => <div className="calendar-month-weekday" key={weekday.full}>{weekday.short}</div>)}
                  {calendarDays.map((date) => {
                    const key = dateKey(date);
                    const dayEvents = eventsByDate.get(key) ?? [];
                    const isToday = key === dateKey(today);

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
                          {dayEvents.map((event) => (
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
                  data-selected-day={(selectedDate.getDay() + 6) % 7}
                >
                  <div className="calendar-week-head">
                    <div className="calendar-time-gutter" aria-hidden="true" />
                    {visibleDays.map((date) => {
                      const key = dateKey(date);
                      const isToday = key === dateKey(today);
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
                        const dayEvents = eventsByDate.get(key) ?? [];
                        const isToday = key === dateKey(today);

                        return (
                          <div className={`calendar-day-column${isToday ? " is-today" : ""}`} key={key}>
                            {dayEvents.map((event) => {
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
                                    <small>{eventKindLabels[event.kind].replace(" law", "").toUpperCase()} ({event.durationMinutes} MIN)</small>
                                  </button>
                                  <div className="calendar-event-actions">
                                    {event.source !== "intake" && (
                                      <>
                                        <button type="button" aria-label={`Edit ${event.title}`} onClick={() => openEditEvent(event)}>
                                          <Pencil size={9.38} />
                                        </button>
                                        <button type="button" aria-label={`Delete ${event.title}`} onClick={() => void deleteEvent(event.id)}>
                                          <Trash2 size={9.38} />
                                        </button>
                                      </>
                                    )}
                                    {event.source === "intake" && <span className="calendar-intake-pill"><Sparkles size={8} /> Auto</span>}
                                  </div>
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
                <div><dt>Total events</dt><dd>{events.length}</dd></div>
                <div><dt>Intake reminders</dt><dd>{events.filter((event) => event.source === "intake").length}</dd></div>
                <div><dt>Manual entries</dt><dd>{events.filter((event) => event.source !== "intake").length}</dd></div>
              </dl>
            </section>
          </aside>
        </div>
      </main>
      {isModalOpen && (
        <div className="calendar-event-modal-backdrop" onClick={(event) => {
          if (event.target === event.currentTarget) setIsModalOpen(false);
        }}>
          <div className="calendar-event-modal" role="dialog" aria-modal="true" aria-label={editingEventId ? "Edit calendar event" : "Create calendar event"}>
            <header className="calendar-event-modal-header">
              <div>
                <h2>{editingEventId ? "Edit event" : "New event"}</h2>
                <p>{editingEventId ? "Update details for this calendar item." : "Create a calendar item and keep your schedule current."}</p>
              </div>
              <button type="button" className="calendar-event-close" aria-label="Close event editor" onClick={() => setIsModalOpen(false)}>
                <X size={12.06} />
              </button>
            </header>
            <form className="calendar-event-form" onSubmit={saveEvent}>
              <div className="calendar-event-field-grid">
                <label>
                  <span>Title</span>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Client name or meeting title" required />
                </label>
                <label>
                  <span>Matter</span>
                  <input value={draft.matter} onChange={(event) => setDraft((current) => ({ ...current, matter: event.target.value }))} placeholder="Intake or matter type" required />
                </label>
                <label>
                  <span>Type</span>
                  <select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as EventKind }))}>
                    {Object.entries(eventKindLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Date</span>
                  <input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} required />
                </label>
                <label>
                  <span>Start time</span>
                  <input type="time" value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} required />
                </label>
                <label>
                  <span>Duration (minutes)</span>
                  <input type="number" min={15} max={480} step={15} value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: Number(event.target.value) || 60 }))} required />
                </label>
                <label className="calendar-event-field--wide">
                  <span>Location</span>
                  <input value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} placeholder="Conference room, video call, etc." />
                </label>
                <label className="calendar-event-field--wide">
                  <span>Details</span>
                  <textarea value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} placeholder="Add a brief note for the meeting or follow-up." rows={3} />
                </label>
                <label className="calendar-event-field--wide">
                  <span>Attendees</span>
                  <input value={draft.attendees} onChange={(event) => setDraft((current) => ({ ...current, attendees: event.target.value }))} placeholder="Client, counsel, team members" />
                </label>
              </div>
              <footer className="calendar-event-modal-footer">
                <button type="button" className="calendar-event-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="calendar-event-save" disabled={isSavingEvent}>
                  {isSavingEvent ? "Saving…" : editingEventId ? "Update event" : "Add event"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
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
