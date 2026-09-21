import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidate } from "@/lib/cacheInvalidation";
import { broadcast } from "@/lib/cacheChannel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { TIMEZONE_GROUPS, getBrowserTimezone } from "@/lib/timezone-utils";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Clock, 
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Ban,
  AlertCircle,
  Globe
} from "lucide-react";
import { format } from "date-fns";
import { posthog } from "@/lib/posthog";

interface MentorAvailability {
  id: number;
  profileId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BlockedDate {
  id: number;
  profileId: number;
  blockedDate: string;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const TIME_SLOTS = [
  "00:00", "00:30", "01:00", "01:30", "02:00", "02:30",
  "03:00", "03:30", "04:00", "04:30", "05:00", "05:30",
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30",
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30"
];


export default function AvailabilityManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form states for adding availability
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("17:00");
  const [timezone, setTimezone] = useState<string>(() => getBrowserTimezone());
  const [savedTimezone, setSavedTimezone] = useState<string>(() => getBrowserTimezone());

  // Form states for blocking dates
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [blockReason, setBlockReason] = useState<string>("");

  // Fetch profile to get timezone
  const { data: profile } = useQuery<any>({
    queryKey: ["/api/dashboard/profile"],
  });

  // Update local timezone state when profile loads
  useEffect(() => {
    if (profile?.timezone) {
      setTimezone(profile.timezone);
      setSavedTimezone(profile.timezone);
    }
  }, [profile]);

  // Fetch availability
  const { data: availability = [], isLoading: isLoadingAvailability } = useQuery<MentorAvailability[]>({
    queryKey: ["/api/dashboard/availability"],
  });

  // Fetch blocked dates
  const { data: blockedDates = [], isLoading: isLoadingBlocked } = useQuery<BlockedDate[]>({
    queryKey: ["/api/dashboard/blocked-dates"],
  });

  // Create availability mutation
  const createAvailabilityMutation = useMutation({
    mutationFn: async (data: { dayOfWeek: number; startTime: string; endTime: string }) => {
      return await apiRequest("POST", "/api/dashboard/availability", data);
    },
    onSuccess: () => {
      invalidate.availability(queryClient);
      broadcast({ type: "availability-updated" });
      const existingSlots = queryClient.getQueryData<any[]>(["/api/dashboard/availability"]) ?? [];
      if (existingSlots.length === 0) {
        posthog.capture('availability_configured', { day_of_week: selectedDay });
      }
      toast({
        title: "Success",
        description: "Availability added successfully",
      });
      // Reset form
      setSelectedDay(1);
      setStartTime("09:00");
      setEndTime("17:00");
    },
    onError: (error: any) => {
      console.error("Create availability error:", error);
      const raw = error?.data?.message || error?.message || "";
      const isOverlap = raw === "AVAILABILITY_OVERLAP";
      toast({
        title: isOverlap ? "Overlapping Time Slot" : "Error",
        description: isOverlap
          ? "This time slot overlaps with an existing one on the same day."
          : raw || "Failed to add availability",
        variant: "destructive",
      });
    },
  });

  // Delete availability mutation
  const deleteAvailabilityMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/dashboard/availability/${id}`);
    },
    onSuccess: () => {
      invalidate.availability(queryClient);
      broadcast({ type: "availability-updated" });
      toast({
        title: "Success",
        description: "Availability deleted successfully",
      });
    },
    onError: (error: any) => {
      console.error("Delete availability error:", error);
      const errorMessage = error?.data?.message || error?.message || "Failed to delete availability";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Create blocked date mutation
  const createBlockedDateMutation = useMutation({
    mutationFn: async (data: { blockedDate: string; reason?: string }) => {
      return await apiRequest("POST", "/api/dashboard/blocked-dates", data);
    },
    onSuccess: () => {
      invalidate.availability(queryClient);
      broadcast({ type: "availability-updated" });
      toast({
        title: "Success",
        description: "Date blocked successfully",
      });
      // Reset form
      setSelectedDate(undefined);
      setBlockReason("");
    },
    onError: (error: any) => {
      console.error("Block date error:", error);
      const errorMessage = error?.data?.message || error?.message || "Failed to block date";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Delete blocked date mutation
  const deleteBlockedDateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/dashboard/blocked-dates/${id}`);
    },
    onSuccess: () => {
      invalidate.availability(queryClient);
      broadcast({ type: "availability-updated" });
      toast({
        title: "Success",
        description: "Blocked date removed successfully",
      });
    },
    onError: (error: any) => {
      console.error("Delete blocked date error:", error);
      const errorMessage = error?.data?.message || error?.message || "Failed to remove blocked date";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Update timezone mutation
  const updateTimezoneMutation = useMutation({
    mutationFn: async (newTimezone: string) => {
      return await apiRequest("PATCH", "/api/dashboard/profile", { timezone: newTimezone });
    },
    onSuccess: () => {
      setSavedTimezone(timezone);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      toast({
        title: "Success",
        description: "Timezone saved successfully",
      });
    },
    onError: (error: any) => {
      console.error("Update timezone error:", error);
      const errorMessage = error?.data?.message || error?.message || "Failed to update timezone";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddAvailability = () => {
    if (startTime >= endTime) {
      toast({
        title: "Invalid Time Range",
        description: "End time must be after start time",
        variant: "destructive",
      });
      return;
    }

    // Check for overlap against existing slots on the same day
    const sameDay = availability.filter(s => s.dayOfWeek === selectedDay);
    const hasOverlap = sameDay.some(s => startTime < s.endTime && s.startTime < endTime);
    if (hasOverlap) {
      toast({
        title: "Overlapping Time Slot",
        description: "This time slot overlaps with an existing one on the same day.",
        variant: "destructive",
      });
      return;
    }

    createAvailabilityMutation.mutate({
      dayOfWeek: selectedDay,
      startTime,
      endTime,
    });
  };

  const handleBlockDate = () => {
    if (!selectedDate) {
      toast({
        title: "No Date Selected",
        description: "Please select a date to block",
        variant: "destructive",
      });
      return;
    }

    createBlockedDateMutation.mutate({
      blockedDate: selectedDate.toISOString(),
      reason: blockReason || undefined,
    });
  };

  const handleTimezoneChange = (newTimezone: string) => {
    setTimezone(newTimezone);
  };

  // Group availability by day
  const availabilityByDay = DAYS_OF_WEEK.map(day => ({
    ...day,
    slots: availability.filter(a => a.dayOfWeek === day.value)
  }));

  return (
    <div className="space-y-6">
      {/* Timezone Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Timezone Settings
          </CardTitle>
          <CardDescription>
            Set your timezone so clients can see your availability in your local time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-3">
            <Label htmlFor="timezone">Your Timezone</Label>
            <Select value={timezone} onValueChange={handleTimezoneChange}>
              <SelectTrigger id="timezone" data-testid="select-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {TIMEZONE_GROUPS.map((group, index) => (
                  <SelectGroup key={group.region}>
                    <SelectLabel className={`sticky top-0 z-10 bg-accent px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-foreground ${index > 0 ? 'mt-2 border-t border-border' : ''}`}>
                      {group.region}
                    </SelectLabel>
                    {group.timezones.map(tz => (
                      <SelectItem key={tz.value} value={tz.value} className="pl-4">
                        <span className="font-medium">{tz.abbr}</span>
                        <span className="ml-1.5 text-muted-foreground">- {tz.label}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              This timezone will be displayed to clients when they book sessions.
            </p>
            <Button
              data-testid="button-save-timezone"
              onClick={() => updateTimezoneMutation.mutate(timezone)}
              disabled={timezone === savedTimezone || updateTimezoneMutation.isPending}
              size="sm"
            >
              {updateTimezoneMutation.isPending ? "Saving…" : "Save Timezone"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Weekly Availability Schedule
          </CardTitle>
          <CardDescription>
            Set your recurring weekly availability. Clients will only be able to book during these times.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add Availability Form */}
          <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
            <h3 className="font-semibold text-sm">Add Availability</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="day">Day of Week</Label>
                <Select value={selectedDay.toString()} onValueChange={(v) => setSelectedDay(parseInt(v))}>
                  <SelectTrigger id="day" data-testid="select-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map(day => (
                      <SelectItem key={day.value} value={day.value.toString()}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="start-time">Start Time</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger id="start-time" data-testid="select-start-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(time => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="end-time">End Time</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger id="end-time" data-testid="select-end-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(time => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleAddAvailability}
                  disabled={createAvailabilityMutation.isPending}
                  className="w-full"
                  data-testid="button-add-availability"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Display Current Availability */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Current Schedule</h3>
            {isLoadingAvailability ? (
              <div className="text-center py-4 text-gray-500">Loading...</div>
            ) : availabilityByDay.filter(day => day.slots.length > 0).length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>No availability set yet</p>
                <p className="text-sm mt-1">Add your available times above</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availabilityByDay.map(day => (
                  day.slots.length > 0 && (
                    <div key={day.value} className="p-3 border rounded-lg">
                      <div className="font-medium text-sm mb-2">{day.label}</div>
                      <div className="space-y-2">
                        {day.slots.map(slot => (
                          <div key={slot.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                            <span className="text-sm flex items-center gap-2">
                              <Clock className="w-4 h-4 text-gray-400" />
                              {slot.startTime} - {slot.endTime}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteAvailabilityMutation.mutate(slot.id)}
                              disabled={deleteAvailabilityMutation.isPending}
                              data-testid={`button-delete-availability-${slot.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Blocked Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5" />
            Block Specific Dates
          </CardTitle>
          <CardDescription>
            Block specific dates when you're unavailable (holidays, vacations, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Block Date Form */}
          <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
            <h3 className="font-semibold text-sm">Block a Date</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Select Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="border rounded-md"
                  data-testid="calendar-block-date"
                />
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="block-reason">Reason (Optional)</Label>
                  <Input
                    id="block-reason"
                    placeholder="e.g., Vacation, Holiday"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    data-testid="input-block-reason"
                  />
                </div>
                {selectedDate && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Selected:</strong> {format(selectedDate, "MMMM d, yyyy")}
                    </p>
                  </div>
                )}
                <Button 
                  onClick={handleBlockDate}
                  disabled={createBlockedDateMutation.isPending || !selectedDate}
                  className="w-full"
                  data-testid="button-block-date"
                >
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Block Date
                </Button>
              </div>
            </div>
          </div>

          {/* Display Blocked Dates */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Blocked Dates</h3>
            {isLoadingBlocked ? (
              <div className="text-center py-4 text-gray-500">Loading...</div>
            ) : blockedDates.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <Ban className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p>No blocked dates</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedDates.map(blocked => (
                  <div key={blocked.id} className="flex items-center justify-between p-3 border rounded-lg bg-red-50 border-red-200">
                    <div className="flex items-center gap-3">
                      <CalendarIcon className="w-4 h-4 text-red-500" />
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(blocked.blockedDate), "MMMM d, yyyy")}
                        </p>
                        {blocked.reason && (
                          <p className="text-xs text-gray-600">{blocked.reason}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteBlockedDateMutation.mutate(blocked.id)}
                      disabled={deleteBlockedDateMutation.isPending}
                      data-testid={`button-delete-blocked-${blocked.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
