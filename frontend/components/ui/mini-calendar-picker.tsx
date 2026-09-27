"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { format, isSameDay, isWithinInterval, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, startOfDay, endOfDay, subDays, isAfter, isBefore } from "date-fns";
import { Button } from "@/components/ui/button";

export interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date, presetLabel?: string) => void;
  className?: string;
  allowFuture?: boolean;
}

export function MiniCalendarPicker({
  startDate,
  endDate,
  onChange,
  className = "",
  allowFuture = false,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(startDate || new Date());
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [selectingStart, setSelectingStart] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const today = startOfDay(new Date());
  const isSingleDay = isSameDay(startDate, endDate);

  // Formatting date range label
  const formattedLabel = isSingleDay
    ? isSameDay(startDate, today)
      ? "Today"
      : isSameDay(startDate, subDays(today, 1))
      ? "Yesterday"
      : format(startDate, "d MMM yyyy")
    : `${format(startDate, "d MMM")} - ${format(endDate, "d MMM yyyy")}`;

  // Stepper handlers
  const handlePrev = () => {
    if (isSingleDay) {
      const prev = subDays(startDate, 1);
      onChange(startOfDay(prev), endOfDay(prev), "custom");
    } else {
      const durationMs = endDate.getTime() - startDate.getTime();
      const prevEnd = new Date(startDate.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);
      onChange(startOfDay(prevStart), endOfDay(prevEnd), "custom");
    }
  };

  const handleNext = () => {
    if (isSingleDay) {
      const next = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      if (!allowFuture && isAfter(startOfDay(next), today)) return;
      onChange(startOfDay(next), endOfDay(next), "custom");
    } else {
      const durationMs = endDate.getTime() - startDate.getTime();
      const nextStart = new Date(endDate.getTime() + 1);
      const nextEnd = new Date(nextStart.getTime() + durationMs);
      if (!allowFuture && isAfter(startOfDay(nextStart), today)) return;
      onChange(startOfDay(nextStart), endOfDay(nextEnd), "custom");
    }
  };

  const isNextDisabled = !allowFuture && (isSingleDay ? isSameDay(startDate, today) || isAfter(startDate, today) : isAfter(endDate, today));

  // Calendar Day Click Handler
  const handleDayClick = (day: Date) => {
    if (!allowFuture && isAfter(day, today)) return;

    if (!selectingStart) {
      // First click: sets temporary start date
      setSelectingStart(day);
    } else {
      // Second click: completes range or resets to single day if clicking same day
      let newStart = selectingStart;
      let newEnd = day;

      if (isBefore(day, selectingStart)) {
        newStart = day;
        newEnd = selectingStart;
      }

      setSelectingStart(null);
      onChange(startOfDay(newStart), endOfDay(newEnd), isSameDay(newStart, newEnd) ? "single" : "custom");
      setIsOpen(false);
    }
  };

  const handlePreset = (preset: "today" | "yesterday" | "last7" | "last30" | "thisMonth") => {
    setSelectingStart(null);
    if (preset === "today") {
      onChange(today, endOfDay(today), "Today");
    } else if (preset === "yesterday") {
      const y = subDays(today, 1);
      onChange(startOfDay(y), endOfDay(y), "Yesterday");
    } else if (preset === "last7") {
      onChange(startOfDay(subDays(today, 6)), endOfDay(today), "Last 7 Days");
    } else if (preset === "last30") {
      onChange(startOfDay(subDays(today, 29)), endOfDay(today), "Last 30 Days");
    } else if (preset === "thisMonth") {
      const startM = startOfMonth(today);
      onChange(startOfDay(startM), endOfDay(today), "This Month");
    }
    setIsOpen(false);
  };

  // Calendar Grid calculation
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const daysInCalendar = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`} ref={containerRef}>
      {/* Prev Day / Period Stepper Button */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handlePrev}
        className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground active:scale-95 transition-all"
        title="Previous Period"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Popover Trigger */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 text-xs font-semibold px-2.5 gap-2 border-border/80 bg-card hover:bg-muted/50 active:scale-95 transition-all shadow-sm"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-mono">{formattedLabel}</span>
      </Button>

      {/* Next Day / Period Stepper Button */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleNext}
        disabled={isNextDisabled}
        className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground active:scale-95 transition-all disabled:opacity-40"
        title="Next Period"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Calendar Dropdown Popover */}
      {isOpen && (
        <div className="absolute top-10 right-0 z-50 w-72 sm:w-80 bg-popover text-popover-foreground border shadow-xl rounded-xl p-3 space-y-3 animate-in fade-in-50 zoom-in-95">
          {/* Header Controls */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold font-mono uppercase tracking-wider">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Preset Buttons Bar */}
          <div className="flex flex-wrap gap-1 bg-muted/50 p-1 rounded-lg text-[10px] font-medium">
            <button
              type="button"
              onClick={() => handlePreset("today")}
              className="px-2 py-1 rounded hover:bg-card hover:text-foreground text-muted-foreground font-semibold transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePreset("yesterday")}
              className="px-2 py-1 rounded hover:bg-card hover:text-foreground text-muted-foreground font-semibold transition-colors"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => handlePreset("last7")}
              className="px-2 py-1 rounded hover:bg-card hover:text-foreground text-muted-foreground font-semibold transition-colors"
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => handlePreset("last30")}
              className="px-2 py-1 rounded hover:bg-card hover:text-foreground text-muted-foreground font-semibold transition-colors"
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => handlePreset("thisMonth")}
              className="px-2 py-1 rounded hover:bg-card hover:text-foreground text-muted-foreground font-semibold transition-colors"
            >
              This Month
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-muted-foreground font-mono">
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
            <span>Su</span>
          </div>

          {/* Calendar Grid Days */}
          <div className="grid grid-cols-7 gap-1">
            {daysInCalendar.map((day) => {
              const isCurrentMonth = isSameDay(startOfMonth(day), monthStart);
              const isDisabled = !allowFuture && isAfter(day, today);
              const isTodayDay = isSameDay(day, today);

              // Check selection states
              const isSelectedStart = selectingStart ? isSameDay(day, selectingStart) : isSameDay(day, startDate);
              const isSelectedEnd = selectingStart ? (hoverDate ? isSameDay(day, hoverDate) : false) : isSameDay(day, endDate);

              let inSelectedRange = false;
              if (selectingStart && hoverDate) {
                const s = isBefore(selectingStart, hoverDate) ? selectingStart : hoverDate;
                const e = isAfter(selectingStart, hoverDate) ? selectingStart : hoverDate;
                inSelectedRange = isWithinInterval(day, { start: s, end: e });
              } else if (!isSingleDay) {
                inSelectedRange = isWithinInterval(day, { start: startDate, end: endDate });
              }

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => setHoverDate(day)}
                  className={`h-8 text-xs font-mono rounded-md flex items-center justify-center transition-all ${
                    !isCurrentMonth ? "opacity-30 text-muted-foreground" : ""
                  } ${
                    isDisabled ? "cursor-not-allowed opacity-25" : "hover:bg-primary/20 hover:text-foreground cursor-pointer"
                  } ${
                    isSelectedStart || isSelectedEnd
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : inSelectedRange
                      ? "bg-primary/15 text-primary font-semibold"
                      : isTodayDay
                      ? "border border-primary text-primary font-bold"
                      : "text-foreground"
                  }`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          {/* Footer instruction */}
          <div className="text-[10px] text-muted-foreground text-center font-medium border-t pt-2 flex items-center justify-between px-1">
            <span>{selectingStart ? "Click end date for range" : "Click date (or click start & end for range)"}</span>
            <button
              type="button"
              onClick={() => handlePreset("today")}
              className="text-primary hover:underline font-semibold flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
