import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  Package,
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  CreditCard,
  ShoppingBag,
} from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@shared/currencies";
import { PaymentsManagement } from "./payments-management";

interface EarningsSummary {
  currencyTotals: { currency: string; total: string }[];
  productSales: number;
  eventRegistrations: number;
  sessionBookings: number;
}

interface EarningsTransaction {
  id: number;
  type: string;
  label: string;
  customerName: string | null;
  customerEmail: string | null;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === 'verified' || lower === 'completed' || lower === 'confirmed') {
    return (
      <Badge className="bg-green-100 text-green-800 flex items-center gap-1 w-fit">
        <CheckCircle className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  }
  if (lower === 'refunded') {
    return (
      <Badge className="bg-gray-100 text-gray-700 flex items-center gap-1 w-fit">
        <XCircle className="w-3 h-3" />
        Refunded
      </Badge>
    );
  }
  if (lower === 'rejected') {
    return (
      <Badge className="bg-red-100 text-red-800 flex items-center gap-1 w-fit">
        <AlertCircle className="w-3 h-3" />
        Rejected
      </Badge>
    );
  }
  if (lower === 'requested' || lower === 'proof_uploaded') {
    return (
      <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1 w-fit">
        <Clock className="w-3 h-3" />
        {lower === 'proof_uploaded' ? 'Proof Submitted' : 'Requested'}
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 flex items-center gap-1 w-fit">
      <Clock className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function typeIcon(type: string) {
  if (type === 'product') return <Package className="w-5 h-5 text-blue-600" />;
  if (type === 'event') return <Calendar className="w-5 h-5 text-green-600" />;
  return <Users className="w-5 h-5 text-purple-600" />;
}

function typeLabel(type: string) {
  if (type === 'product') return 'Digital Product';
  if (type === 'event') return 'Event Registration';
  return 'Session Booking';
}

function SummarySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
      <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
    </div>
  );
}

export function WalletManagement() {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<EarningsSummary>({
    queryKey: ["/api/dashboard/wallet/summary"],
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<EarningsTransaction[]>({
    queryKey: ["/api/dashboard/wallet/transactions"],
  });

  if (summaryLoading || txLoading) {
    return <SummarySkeleton />;
  }

  const currencyTotals = summary?.currencyTotals ?? [];
  const hasEarnings = currencyTotals.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Payments and Earnings</h2>
        <p className="text-gray-600">Manage your payment methods and track confirmed earnings</p>
      </div>

      {/* Configure Payment Methods — shown first */}
      <Card className="border-gray-200">
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-900">Configure Payment Methods</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set up how clients pay you — UPI, bank transfer, PayPal, and more.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setPaymentDialogOpen(true)}
            data-testid="button-open-payment-methods"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Configure
          </Button>
        </CardContent>
      </Card>

      {/* Payment Methods Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Methods</DialogTitle>
            <DialogDescription>
              Configure how clients can pay you — UPI, bank transfer, PayPal, and more.
            </DialogDescription>
          </DialogHeader>
          <PaymentsManagement hideHeader />
        </DialogContent>
      </Dialog>

      {/* Total Earnings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-700">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Total Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasEarnings ? (
            <div className="flex flex-wrap gap-4">
              {currencyTotals.map(({ currency, total }) => (
                <div key={currency} className="flex flex-col">
                  <span className="text-3xl font-extrabold text-gray-900">
                    {formatPrice(total, currency)}
                  </span>
                  <span className="text-xs text-gray-500 mt-0.5">{currency}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <span className="text-3xl font-extrabold text-gray-400">—</span>
              <p className="text-sm text-gray-500">No confirmed earnings yet</p>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Includes only verified & completed session bookings, completed product sales, and confirmed event registrations.
          </p>
        </CardContent>
      </Card>

      {/* Sales Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-700">
            <ShoppingBag className="w-5 h-5 text-gray-600" />
            Sales Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-xl">
              <Package className="w-8 h-8 text-blue-600" />
              <p className="text-3xl font-bold text-gray-900">{summary?.productSales ?? 0}</p>
              <p className="text-sm text-gray-600 text-center">Digital Products Sold</p>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 bg-green-50 rounded-xl">
              <Calendar className="w-8 h-8 text-green-600" />
              <p className="text-3xl font-bold text-gray-900">{summary?.eventRegistrations ?? 0}</p>
              <p className="text-sm text-gray-600 text-center">Event Registrations</p>
            </div>
            <div className="flex flex-col items-center gap-2 p-4 bg-purple-50 rounded-xl">
              <Users className="w-8 h-8 text-purple-600" />
              <p className="text-3xl font-bold text-gray-900">{summary?.sessionBookings ?? 0}</p>
              <p className="text-sm text-gray-600 text-center">Session Bookings</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-700">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((txn) => (
                <div
                  key={`${txn.type}-${txn.id}`}
                  data-testid={`transaction-row-${txn.type}-${txn.id}`}
                  className="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex-shrink-0 flex items-center justify-center">
                      {typeIcon(txn.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate" title={txn.label}>
                        {txn.label}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {txn.customerName || txn.customerEmail || '—'}
                        <span className="mx-1.5 text-gray-300">·</span>
                        <span className="text-gray-400">{typeLabel(txn.type)}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {txn.createdAt ? format(new Date(txn.createdAt), 'MMM d, yyyy') : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 ml-3 flex-shrink-0">
                    <span className="font-bold text-gray-900 text-sm">
                      {formatPrice(txn.amount, (txn.currency || 'USD').toUpperCase())}
                    </span>
                    <StatusBadge status={txn.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <TrendingUp className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <h3 className="text-base font-medium text-gray-700 mb-1">No activity yet</h3>
              <p className="text-sm text-gray-500">
                Your sales and booking activity will appear here once you start receiving payments.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
