"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FilePlus2,
  MapPin,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./calendar-workspace.css";

type EventKind = "consultation" | "hearing" | "deadline";

type CalendarEvent = {
  id: string;
  day: number;
  time: string;
  title: string;
  matter: string;
  kind: EventKind;
  location: string;
};

const sampleEvents: CalendarEvent[] = [
  {
    id: "consult-01",
    day: 3,
    time: "09:30 AM",
    title: "Initial client consultation",
    matter: "Santos · Employment concern",
    kind: "consultation",
    location: "Meeting room 1",
  },
  {
    id: "hearing-01",
    day: 8,
    time: "02:00 PM",
    title: "DOLE mediation conference",
    matter: "Santos v. Northstar Agency",
    kind: "hearing",
    location: "DOLE NCR, Quezon City",
  },
  {
    id: "deadline-01",
    day: 12,
    time: "11:00 AM",
    title: "Submit position paper",
    matter: "Reyes · Civil dispute",
    kind: "deadline",
    location: "Filing deadline",
  },
  {
    id: "consult-02",
    day: 17,
    time: "10:00 AM",
    title: "Contract mediation conference",
    matter: "Fintrex Development Corp.",
    kind: "consultation",
    location: "Meeting room 2",
  },
  {
    id: "hearing-02",
    day: 21,
    time: "01:30 PM",
    title: "Pre-trial conference",
    matter: "People v. Alcantara",
    kind: "hearing",
    location: "Regional Trial Court",
  },
  {
    id: "deadline-02",
    day: 26,
    time: "09:00 AM",
    title: "Review evidence submission",
    matter: "Garcia · Property matter",
    kind: "deadline",
    location: "Internal deadline",
  },
  {
    id: "consult-03",
    day: 28,
    time: "03:00 PM",
    title: "Client case update",
    matter: "Client Case #0839",
    kind: "consultation",
    location: "Video call",
  },
];

const weekdays = [
  { short: "Mon", compact: "M" },
  { short: "Tue", compact: "T" },
  { short: "Wed", compact: "W" },
  { short: "Thu", compact: "T" },
  { short: "Fri", compact: "F" },
  { short: "Sat", compact: "S" },
  { short: "Sun", compact: "S" },
];

const eventKindLabels: Record<EventKind, string> = {
  consultation: "Consultation",
  hearing: "Hearing",
  deadline: "Deadline",
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

export default function CalendarWorkspace() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const monthEvents = useMemo(
    () =>
      sampleEvents.map((event) => ({
        ...event,
        date: new Date(month.getFullYear(), month.getMonth(), event.day),
      })),
    [month],
  );

  const eventsByDate = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = monthEvents.filter((event) =>
      !query || `${event.title} ${event.matter} ${event.location} ${eventKindLabels[event.kind]}`.toLowerCase().includes(query),
    );
    const grouped = new Map<string, (typeof visible)[number][]>();

    for (const event of visible) {
      const key = dateKey(event.date);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [monthEvents, search]);

  const selectedEvents = eventsByDate.get(dateKey(selectedDate)) ?? [];
  const hasSearchMatches = eventsByDate.size > 0;
  const calendarDays = getCalendarDays(month);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(month);
  const selectedDateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(selectedDate);

  const moveMonth = (direction: -1 | 1) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    const finalDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setMonth(nextMonth);
    setSelectedDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selectedDate.getDate(), finalDay)));
  };

  const goToToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const unavailable = (label: string) => setToast(`${label} is not part of this demo yet.`);

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
        <div className="dashboard-heading">
          <div>
            <h1>Calendar</h1>
          </div>
          <button className="new-intake-button calendar-create-button" type="button" onClick={() => unavailable("Event creation")}>
            <FilePlus2 aria-hidden="true" size={15} /> Create event
          </button>
        </div>

        <div className="calendar-layout">
          <section className="calendar-panel" aria-label="Calendar month view">
            <div className="calendar-toolbar">
              <div className="calendar-month-switcher">
                <button className="calendar-icon-button" type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
                  <ChevronLeft size={18} />
                </button>
                <h2 aria-live="polite">{monthLabel}</h2>
                <button className="calendar-icon-button" type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <button className="calendar-today-button" type="button" onClick={goToToday}>Today</button>
            </div>

            <div className="calendar-legend" aria-label="Appointment types">
              <span><i className="calendar-legend-dot calendar-legend-dot--consultation" />Consultation</span>
              <span><i className="calendar-legend-dot calendar-legend-dot--hearing" />Hearing</span>
              <span><i className="calendar-legend-dot calendar-legend-dot--deadline" />Deadline</span>
            </div>

            <div className="calendar-grid">
              {weekdays.map((weekday) => (
                <div className="calendar-weekday" key={weekday.short}>
                  <span className="calendar-weekday-full">{weekday.short}</span>
                  <span className="calendar-weekday-compact">{weekday.compact}</span>
                </div>
              ))}
              {calendarDays.map((date) => {
                const key = dateKey(date);
                const events = eventsByDate.get(key) ?? [];
                const isCurrentMonth = date.getMonth() === month.getMonth();
                const isToday = key === dateKey(today);
                const isSelected = key === dateKey(selectedDate);

                return (
                  <button
                    className={[
                      "calendar-day",
                      isCurrentMonth ? "" : "calendar-day--outside",
                      isToday ? "calendar-day--today" : "",
                      isSelected ? "calendar-day--selected" : "",
                    ].filter(Boolean).join(" ")}
                    type="button"
                    key={key}
                    aria-pressed={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date)}${events.length ? `, ${events.length} ${events.length === 1 ? "appointment" : "appointments"}` : ""}`}
                    onClick={() => selectDate(date)}
                  >
                    <span className="calendar-day-number">{date.getDate()}</span>
                    {events.length > 0 && (
                      <span className="calendar-day-events">
                        {events.slice(0, 2).map((event) => (
                          <span className={`calendar-event-preview calendar-event-preview--${event.kind}`} key={event.id}>
                            <span className="calendar-event-time">{event.time}</span>
                            <span>{event.title}</span>
                          </span>
                        ))}
                        {events.length > 2 && <span className="calendar-more-events">+{events.length - 2} more</span>}
                      </span>
                    )}
                    {events.length > 0 && (
                      <span className="calendar-mobile-dots" aria-hidden="true">
                        {events.slice(0, 3).map((event) => <i className={`calendar-legend-dot--${event.kind}`} key={event.id} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="calendar-sample-note">Sample calendar entries for interface preview. No appointments are connected.</p>
          </section>

          <aside className="agenda-panel" aria-labelledby="agenda-heading">
            <div className="agenda-panel-heading">
              <div>
                <h2 id="agenda-heading">Selected day</h2>
                <p>{selectedDateLabel}</p>
              </div>
              <span className="agenda-count">{selectedEvents.length}</span>
            </div>
            {selectedEvents.length > 0 ? (
              <div className="agenda-events" aria-live="polite">
                {selectedEvents.map((event) => (
                  <article className={`agenda-event agenda-event--${event.kind}`} key={event.id}>
                    <div className="agenda-event-time"><Clock3 aria-hidden="true" size={14} />{event.time}</div>
                    <div className="agenda-event-content">
                      <span className={`agenda-event-kind agenda-event-kind--${event.kind}`}>{eventKindLabels[event.kind]}</span>
                      <h3>{event.title}</h3>
                      <p>{event.matter}</p>
                      <span className="agenda-event-location"><MapPin aria-hidden="true" size={13} />{event.location}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="agenda-empty" aria-live="polite">
                <span className="agenda-empty-icon"><CalendarDays aria-hidden="true" size={20} /></span>
                <h3>{search && !hasSearchMatches ? "No matching appointments" : search ? "No matches on this day" : "Nothing scheduled"}</h3>
                <p>{search && !hasSearchMatches ? "Try another search term." : search ? "This search has appointments on other dates." : "There are no appointments on this day. Choose another date or create an event."}</p>
                {!search && (
                  <button type="button" onClick={() => unavailable("Event creation")}>
                    Create event
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
      {toast && (
        <div className="toast calendar-toast" role="status">
          <span className="toast-check"><Check size={16} /></span>
          <span>{toast}</span>
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
