"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart3, ShoppingCart, HandCoins, RotateCcw,
  FileText, Ticket,
} from "lucide-react";
import { ExportButton } from "@/components/admin/export-button";
import { AnalyticsTab } from "@/components/admin/revenue/analytics-tab";
import { OrdersTable } from "@/components/admin/revenue/orders-table";
import { ManualPaymentForm } from "@/components/admin/revenue/manual-payment-form";
import { RefundsTable } from "@/components/admin/revenue/refunds-table";
import { InvoicesTable } from "@/components/admin/revenue/invoices-table";
import { ReferralCodesTable } from "@/components/admin/revenue/referral-codes-table";
import type {
  OrderRow,
  RefundRow,
  InvoiceRow,
  ReferralCodeRow,
} from "./actions";

interface RevenuePageClientProps {
  initialOrders: OrderRow[];
  initialOrdersCount: number;
  initialRefunds: RefundRow[];
  initialRefundsCount: number;
  initialInvoices: InvoiceRow[];
  initialInvoicesCount: number;
  initialReferralCodes: ReferralCodeRow[];
  initialReferralCodesCount: number;
  courses: { id: string; name: string }[];
}

export function RevenuePageClient({
  initialOrders,
  initialOrdersCount,
  initialRefunds,
  initialRefundsCount,
  initialInvoices,
  initialInvoicesCount,
  initialReferralCodes,
  initialReferralCodesCount,
  courses,
}: RevenuePageClientProps) {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="text-muted-foreground mt-1">
          Track payments, manage refunds, and view financial analytics.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="orders">
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="manual">
            <HandCoins className="mr-1.5 h-4 w-4" />
            Manual Payment
          </TabsTrigger>
          <TabsTrigger value="refunds">
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Refunds
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="mr-1.5 h-4 w-4" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="referrals">
            <Ticket className="mr-1.5 h-4 w-4" />
            Referral Codes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <AnalyticsTab />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <OrdersTable
            initialData={initialOrders}
            initialCount={initialOrdersCount}
            courses={courses}
          />
        </TabsContent>

        <TabsContent value="manual" className="mt-6 space-y-4">
          {/* The tab is a form, so the export covers what has already been
              recorded by hand — the cash book, in other words. */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Record a payment collected at the centre.
            </p>
            <ExportButton
              dataset="manual-payments"
              label="Export recorded payments"
              size="default"
            />
          </div>
          <ManualPaymentForm />
        </TabsContent>

        <TabsContent value="refunds" className="mt-6">
          <RefundsTable
            initialData={initialRefunds}
            initialCount={initialRefundsCount}
          />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <InvoicesTable
            initialData={initialInvoices}
            initialCount={initialInvoicesCount}
          />
        </TabsContent>

        <TabsContent value="referrals" className="mt-6">
          <ReferralCodesTable
            initialData={initialReferralCodes}
            initialCount={initialReferralCodesCount}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
