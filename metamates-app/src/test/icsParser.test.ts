import { describe, it, expect } from 'vitest'
import {
  parseIcsEvents,
  getEventsForDate,
  formatEventTime,
} from '../../electron/calendar/icsParser'

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-1
SUMMARY:Team Standup
DTSTART:20250619T090000
DTEND:20250619T093000
LOCATION:Zoom
END:VEVENT
BEGIN:VEVENT
UID:test-2
SUMMARY:All Day Event
DTSTART:20250619
END:VEVENT
END:VCALENDAR`

describe('icsParser', () => {
  it('parses VEVENT blocks', () => {
    const events = parseIcsEvents(SAMPLE_ICS)
    expect(events).toHaveLength(2)
    expect(events[0].summary).toBe('Team Standup')
    expect(events[0].location).toBe('Zoom')
    expect(events[0].allDay).toBe(false)
    expect(events[1].allDay).toBe(true)
  })

  it('filters events for a specific date', () => {
    const events = parseIcsEvents(SAMPLE_ICS)
    const dayEvents = getEventsForDate(events, new Date(2025, 5, 19))
    expect(dayEvents).toHaveLength(2)
  })

  it('formats event time', () => {
    const events = parseIcsEvents(SAMPLE_ICS)
    expect(formatEventTime(events[0])).toMatch(/^\d{2}:\d{2}$/)
    expect(formatEventTime(events[1])).toBe('全天')
  })
})
