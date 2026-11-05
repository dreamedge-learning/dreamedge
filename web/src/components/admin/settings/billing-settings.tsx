"use client";

import { useState, useTransition } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  updateBillingProfile,
  type BillingProfile,
} from "@/app/admin/(panel)/settings/billing-actions";

/**
 * Seller details for receipts, and the switch that turns them into GST tax
 * invoices.
 *
 * The switch stays off until the business is registered under GST.
 * Registration is compulsory once turnover passes Rs 20 lakh in a financial
 * year; below that no GST may be charged at all. Coaching is taxed at 18%
 * under SAC 999293. When it goes on, receipts issued from then show the
 * GSTIN, the taxable value and the CGST/SGST (or IGST) split carved out of
 * the price paid. Receipts already issued keep what they said.
 */
export function BillingSettings({ profile }: { profile: BillingProfile | null }) {
  const [registered, setRegistered] = useState(profile?.gst_registered ?? false);
  const [prefix, setPrefix] = useState(profile?.receipt_prefix ?? "DE");
  const [pending, startTransition] = useTransition();

  if (!profile) {
    return (
      <p className="text-sm text-muted-foreground">
        The billing details could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  function submit(formData: FormData) {
    formData.set("gst_registered", registered ? "true" : "false");
    startTransition(async () => {
      const result = await updateBillingProfile(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Billing details saved. New receipts will use them.");
    });
  }

  const sample = `${(prefix || "DE").toUpperCase()}/26-27/00001`;

  return (
    <form action={submit} className="max-w-2xl space-y-8">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Every paid order gets a numbered receipt automatically.</p>
          <p className="text-muted-foreground">
            Students see it under Payment history; you see it in Revenue → Invoices. Changes
            here apply to receipts issued after you save. Receipts already issued never change.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <h3 className="text-base font-semibold">Business details</h3>

        <div className="space-y-2">
          <Label htmlFor="bp-name">Legal business name</Label>
          <Input id="bp-name" name="legal_name" defaultValue={profile.legal_name} maxLength={120} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bp-address">Address</Label>
          <Textarea
            id="bp-address"
            name="address"
            defaultValue={profile.address}
            rows={3}
            maxLength={400}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <div className="space-y-2">
            <Label htmlFor="bp-state">State</Label>
            <Input id="bp-state" name="state" defaultValue={profile.state} maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-state-code">State code</Label>
            <Input
              id="bp-state-code"
              name="state_code"
              defaultValue={profile.state_code}
              inputMode="numeric"
              maxLength={2}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-base font-semibold">Receipt numbering</h3>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="bp-prefix">Prefix</Label>
            <Input
              id="bp-prefix"
              name="receipt_prefix"
              value={prefix}
              onChange={(event) =>
                setPrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))
              }
              maxLength={4}
            />
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            Numbers look like <span className="font-mono text-foreground">{sample}</span> and
            restart from 1 every April.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="bp-gst">Registered under GST</Label>
            <p className="text-sm text-muted-foreground">
              Off: plain receipts, no GST shown. Turn on only after you have a GSTIN. GST
              registration is required once turnover crosses ₹20 lakh in a financial year;
              until then GST must not be charged.
            </p>
          </div>
          <Switch
            id="bp-gst"
            checked={registered}
            onCheckedChange={(checked) => setRegistered(Boolean(checked))}
          />
        </div>

        {registered && (
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="space-y-2">
              <Label htmlFor="bp-gstin">GSTIN</Label>
              <Input
                id="bp-gstin"
                name="gstin"
                defaultValue={profile.gstin ?? ""}
                placeholder="27ABCDE1234F1Z5"
                maxLength={15}
                className="font-mono uppercase"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bp-rate">GST rate (%)</Label>
                <Input
                  id="bp-rate"
                  name="gst_rate"
                  type="number"
                  min={0}
                  max={40}
                  step="0.01"
                  defaultValue={String(profile.gst_rate)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-sac">SAC code</Label>
                <Input
                  id="bp-sac"
                  name="sac_code"
                  defaultValue={profile.sac_code}
                  inputMode="numeric"
                  maxLength={8}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Coaching is 18% under SAC 999293. Prices stay as they are; the tax is shown as
              part of the price the student paid. Check the rate with your accountant before
              switching on.
            </p>
          </div>
        )}

        {!registered && (
          <>
            {/* Kept so switching off and on again does not lose what was entered. */}
            <input type="hidden" name="gstin" value={profile.gstin ?? ""} />
            <input type="hidden" name="gst_rate" value={String(profile.gst_rate)} />
            <input type="hidden" name="sac_code" value={profile.sac_code} />
          </>
        )}
      </section>

      <section className="space-y-2">
        <Label htmlFor="bp-footer">Footer note (optional)</Label>
        <Textarea
          id="bp-footer"
          name="footer_note"
          defaultValue={profile.footer_note ?? ""}
          rows={2}
          maxLength={500}
          placeholder="e.g. Fees once paid are refundable only as per our refund policy."
        />
      </section>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save billing details
      </Button>
    </form>
  );
}
