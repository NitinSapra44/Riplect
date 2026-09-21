import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EventRegistrationModal } from "@/components/event-registration-modal";
import type { EventWithExtras } from "@shared/schema";

interface InstanceWithCounts extends EventWithExtras {
  registrationCount: number;
  isFull: boolean;
}

interface EventQuickRegisterProps {
  event: EventWithExtras;
  username: string;
  creatorName: string;
  buttonLabel?: string;
  buttonClassName?: string;
}

export function EventQuickRegister({
  event,
  username,
  creatorName,
  buttonLabel = "Register",
  buttonClassName,
}: EventQuickRegisterProps) {
  const [step, setStep] = useState<"idle" | "date-picker" | "register">("idle");
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);

  const isSeries = !!(event.seriesId || event.isRecurring);

  // Determine the right API path for instances
  // - If event.seriesId is set: this event is an instance; use seriesId as root
  // - If event.isRecurring and no seriesId: this event IS the root
  const seriesRootId = event.seriesId ?? (event.isRecurring ? event.id : null);
  const useAsSeriesRoot = !!event.seriesId;

  const instancesUrl = isSeries && seriesRootId
    ? `/api/profiles/${username}/events/${seriesRootId}/instances?${useAsSeriesRoot ? "asSeriesRoot=true&" : ""}limit=20`
    : null;

  const { data: instancesData, isLoading: instancesLoading } = useQuery<{
    instances: InstanceWithCounts[];
    upcomingCount: number;
    total: number;
  }>({
    queryKey: [instancesUrl],
    enabled: step === "date-picker" && isSeries && !!instancesUrl,
  });

  const instances = instancesData?.instances || [];
  const selectedInstance = instances.find((i) => i.id === selectedInstanceId) ?? null;

  const handleRegisterClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSeries) {
      setStep("date-picker");
    } else {
      setStep("register");
    }
  };

  const handleClose = () => {
    setStep("idle");
    setSelectedInstanceId(null);
  };

  const handleContinueToRegister = () => {
    if (!selectedInstanceId) return;
    setStep("register");
  };

  return (
    <>
      <Button
        size="sm"
        onClick={handleRegisterClick}
        className={buttonClassName}
        data-testid={`button-quick-register-${event.id}`}
      >
        {buttonLabel}
      </Button>

      {/* Date picker dialog for series events */}
      {isSeries && (
        <Dialog open={step === "date-picker"} onOpenChange={(open) => !open && handleClose()}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#b66667]" />
                Choose a Date
              </DialogTitle>
              <DialogDescription>
                Select a date to register for <strong>{event.title}</strong>
              </DialogDescription>
            </DialogHeader>

            {instancesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : instances.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                No upcoming dates available.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                {instances.map((inst) => {
                  const instDate = inst.startAt ? new Date(inst.startAt as unknown as string) : null;
                  const isSelected = selectedInstanceId === inst.id;
                  const isCancelled = inst.isCancelled;
                  const isFull = inst.isFull;
                  const isPast = instDate ? instDate < new Date() : false;
                  const spotsLeft =
                    inst.maxAttendees != null
                      ? Math.max(0, inst.maxAttendees - inst.registrationCount)
                      : null;
                  const isSelectable = !isCancelled && !isFull && !isPast;

                  return (
                    <button
                      key={inst.id}
                      type="button"
                      disabled={!isSelectable}
                      onClick={() => isSelectable && setSelectedInstanceId(isSelected ? null : inst.id)}
                      data-testid={`btn-date-${inst.id}`}
                      className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? "border-[#b66667] bg-[#b66667]/5 ring-2 ring-[#b66667]/20"
                          : isSelectable
                          ? "border-gray-200 bg-white hover:border-[#b66667]/50 hover:bg-gray-50 cursor-pointer"
                          : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            {instDate ? format(instDate, "EEE, MMM d") : "—"}
                          </p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {instDate && instDate.getHours() !== 0
                              ? instDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                              : "Time TBA"}
                            {inst.endAt && new Date(inst.endAt as unknown as string).getHours() !== 0
                              ? ` – ${new Date(inst.endAt as unknown as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {isCancelled ? (
                            <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                              Cancelled
                            </span>
                          ) : isFull ? (
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              Full
                            </span>
                          ) : spotsLeft !== null && spotsLeft <= 5 ? (
                            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                              {spotsLeft} left
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                              Open
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-2 flex items-center gap-1 text-[#b66667] text-xs font-medium">
                          <ChevronRight className="w-3 h-3" />
                          Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[#b66667] hover:bg-[#b85858] text-white"
                disabled={!selectedInstanceId}
                onClick={handleContinueToRegister}
                data-testid="button-continue-to-register"
              >
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Registration modal */}
      <EventRegistrationModal
        event={event}
        creatorName={creatorName}
        isOpen={step === "register"}
        onClose={handleClose}
        instanceId={isSeries ? selectedInstanceId : null}
        instanceDate={selectedInstance?.startAt as string | null | undefined}
        instance={selectedInstance}
      />
    </>
  );
}
