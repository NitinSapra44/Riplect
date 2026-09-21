import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { apiRequest } from "@/lib/queryClient";
import { uploadQrImage } from "@/lib/qr-upload";
import { posthog } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import {
  InlinePaymentMethodsEditor,
  DEFAULT_PAYMENT_METHODS,
  mergeWithDefaults,
  type PaymentMethod,
} from "@/components/inline-payment-methods-editor";

interface PaymentSettings {
  coachId: string;
  defaultInstructions: string | null;
  methods: PaymentMethod[];
}

export function PaymentsManagement({ hideHeader = false }: { hideHeader?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [methods, setMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery<PaymentSettings>({
    queryKey: ["/api/dashboard/payment-settings"],
  });

  useEffect(() => {
    if (settings) {
      setMethods(mergeWithDefaults(settings.methods ?? []));
      setHasChanges(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/dashboard/payment-settings", {
        methods: methods.map((m, i) => ({ ...m, order: i })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/payment-settings"] });
      setHasChanges(false);
      const enabledMethods = methods.filter(m => m.enabled).map(m => m.type);
      posthog.capture('payment_setup_completed', { enabled_methods: enabledMethods, method_count: enabledMethods.length });
      posthog.setPersonProperties({ stripe_connected: true });
      toast({ title: "Payment settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save payment settings", variant: "destructive" });
    },
  });

  const saveCallback = useCallback(async () => {
    saveMutation.mutate();
  }, [saveMutation]);

  useUnsavedChanges("payments-form", hasChanges, saveCallback);

  const handleChange = (updated: PaymentMethod[]) => {
    setMethods(updated);
    setHasChanges(true);
  };

  return (
    <div className="space-y-6" data-testid="payments-management">
      {!hideHeader && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold" data-testid="text-payments-title">Payment Methods</h2>
            <p className="text-sm text-muted-foreground">
              Configure how clients can pay for your sessions
            </p>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="button-save-payments"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      )}

      <InlinePaymentMethodsEditor
        methods={methods}
        onChange={handleChange}
        isLoading={isLoading}
        onUploadQr={uploadQrImage}
      />

      {hideHeader && (
        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="button-save-payments"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
