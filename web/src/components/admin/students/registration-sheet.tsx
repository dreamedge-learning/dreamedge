"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUPPORT_PHONE } from "@/lib/site";

/**
 * The sheet handed across the counter at Kalmeshwar.
 *
 * It has to look like a real institutional form, because that is what it is:
 * a parent signs it, it goes in a file, and the stub at the bottom is the
 * student's proof of payment. So: ruled boxes sized for handwriting, one box
 * per character where a digit written over a line becomes a transcription
 * error, and a declaration with a signature line.
 *
 * The field order is the same as the online form and the same as the admin's
 * entry screen. When all three agree the admin can type straight down the
 * page without looking up what maps to what, which is the only thing that
 * makes counter registration during an admission rush bearable.
 *
 * Printing is done from the browser rather than a generated PDF. A print
 * stylesheet that hides the panel is a dozen lines; a PDF pipeline is a
 * dependency, a font-embedding problem and a second place for the field order
 * to drift.
 */

const CENTRE_ADDRESS = [
  "Dream IIT Institute, Near Bharat Gas",
  "Saoner-Kalmeshwar Road, Kalmeshwar",
  "Nagpur, Maharashtra 441501",
];

const PRINT_CSS = `
@page { size: A4 portrait; margin: 11mm; }

/* Only the first copy is on screen. The rest have to be in the document
   rather than conditionally rendered, because a print job can only contain
   what the page already holds -- and they cannot be hidden with opacity or a
   zero height, because those print too. */
@media screen { .de-extra { display: none; } }
@media print  { .de-extra { display: block; } }

@media print {
  /* The panel's shell wraps this page, and nothing here can reach up to it.
     Hiding by visibility rather than display leaves the layout intact, so the
     sheet is not dragged out of position by a collapsed ancestor. */
  body * { visibility: hidden !important; }
  .de-sheet, .de-sheet * { visibility: visible !important; }

  /* The panel scrolls its content region, and a scroll container clips at
     one viewport height when printed. */
  html, body, main {
    height: auto !important;
    overflow: visible !important;
  }

  .de-sheet-stack {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .de-sheet {
    page-break-after: always;
    break-after: page;
    box-shadow: none !important;
    border: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100%;
  }

  .de-sheet:last-child { page-break-after: auto; break-after: auto; }

  /* The brand bar is the only thing on the page a reader uses to tell a real
     form from a photocopy of one, so it has to survive the browser's
     background-stripping. */
  .de-band, .de-stub-band {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;

export function RegistrationSheet() {
  const [copies, setCopies] = useState(5);

  const count = Math.min(Math.max(copies || 1, 1), 50);

  return (
    <div className="space-y-6">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/admin/students/new" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Registration form</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One A4 page per student, with a tear-off receipt. Print a stack and
              keep them at the counter.
            </p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="copies">Blank copies</Label>
            <Input
              id="copies"
              type="number"
              min={1}
              max={50}
              value={copies}
              className="w-24"
              onChange={(event) => {
                // Clearing the input gives an empty string, which `Number`
                // reads as NaN; `setCopies(NaN)` then rendered the field as
                // the literal text "NaN" with no way back without a reload.
                const parsed = parseInt(event.target.value, 10);
                setCopies(Number.isFinite(parsed) ? parsed : 1);
              }}
            />
          </div>
          <Button
            className="bg-brand-orange text-white hover:bg-brand-orange-dark"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print {count} {count === 1 ? "form" : "forms"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing one copy. Printing sends {count}.
      </p>

      <div className="de-sheet-stack space-y-8">
        {Array.from({ length: count }, (_, index) => (
          <Sheet key={index} preview={index === 0} />
        ))}
      </div>
    </div>
  );
}

/** The first copy is the on-screen preview; the rest only ever print. */
function Sheet({ preview }: { preview: boolean }) {
  return (
    <div
      className={
        "de-sheet mx-auto w-full max-w-[210mm] bg-white text-[#16223B] " +
        (preview ? "rounded-lg border border-border shadow-sm" : "de-extra")
      }
    >
      <div className="de-band flex items-center gap-3 bg-[#16223B] px-5 py-3 text-white">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F26A21] text-sm font-bold">
          DE
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight tracking-wide">
            DREAM EDGE
          </p>
          <p className="text-[10px] leading-tight text-white/75">
            Dream IIT Institute · Basic Concept Se Top Result TK
          </p>
        </div>
        <div className="text-right text-[9px] leading-[1.35] text-white/75">
          {CENTRE_ADDRESS.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>{SUPPORT_PHONE}</p>
        </div>
      </div>

      <div className="px-5 pb-4 pt-3">
        <div className="mb-3 flex items-baseline justify-between border-b border-[#16223B] pb-1.5">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em]">
            Student Registration Form
          </h2>
          <span className="text-[9px] text-[#8892A0]">
            Please write in capital letters using a blue or black pen.
          </span>
        </div>

        <SheetSection label="1. Student">
          <WriteRow label="Full name" span={2} />
          <WriteRow label="Date of birth" hint="D D / M M / Y Y Y Y" />
          <WriteRow label="Gender" hint="Male / Female / Other" />
        </SheetSection>

        <SheetSection label="2. School">
          <WriteRow label="Current class" hint="6 / 7 / 8 / 9 / 10" />
          <WriteRow label="Board" hint="CBSE / State / ICSE / Other" />
          <WriteRow label="School name" span={2} />
        </SheetSection>

        <SheetSection label="3. Contact">
          <BoxRow label="Student's mobile" boxes={10} note="Leave blank if none" />
          <WriteRow label="Email" span={2} hint="Leave blank if the student has none" />
          <WriteRow label="Parent / guardian name" />
          <BoxRow label="Parent / guardian mobile" boxes={10} required />
        </SheetSection>

        <SheetSection label="4. Address">
          <WriteRow label="City" />
          <WriteRow label="State" />
          <BoxRow label="PIN code" boxes={6} />
          <WriteRow label="Address" span={2} />
        </SheetSection>

        <div className="mt-3 rounded border border-[#E2E5EA] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[#16223B]">
            Parent / guardian declaration
          </p>
          <p className="mt-1 text-[9px] leading-[1.5] text-[#4a5568]">
            I confirm that the details above are correct and that I am the parent
            or legal guardian of the student named. I consent to Dream Edge
            holding these details for admission, communication and fee purposes,
            and I have read the refund and cancellation policy.
          </p>
          <div className="mt-4 flex items-end gap-6">
            <div className="flex-1">
              <div className="h-7 border-b border-[#16223B]" />
              <p className="mt-1 text-[8px] uppercase tracking-wider text-[#8892A0]">
                Parent / guardian signature
              </p>
            </div>
            <div className="w-40">
              <div className="h-7 border-b border-[#16223B]" />
              <p className="mt-1 text-[8px] uppercase tracking-wider text-[#8892A0]">
                Date
              </p>
            </div>
          </div>
        </div>
      </div>

      <TearLine />

      <div className="px-5 pb-4 pt-2.5">
        <div className="de-stub-band mb-2 flex items-center justify-between rounded-sm bg-[#16223B] px-2.5 py-1 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
            Receipt — student copy
          </span>
          <span className="text-[8px] text-white/70">Dream Edge · Kalmeshwar</span>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-2">
          <StubRow label="Student name" />
          <StubRow label="Student code" />
          <StubRow label="Course" />
          <StubRow label="Amount received" />
          <StubRow label="Mode" hint="Cash / UPI / Cheque / Bank" />
          <StubRow label="Receipt no." />
          <StubRow label="Date" />
          <StubRow label="Received by" />
        </div>

        <div className="mt-3 flex items-end justify-between gap-6">
          <p className="max-w-[60%] text-[8px] leading-[1.5] text-[#8892A0]">
            Keep this stub. Quote the student code for any enquiry about fees,
            classes or course access.
          </p>
          <div className="w-44">
            <div className="h-7 border-b border-[#16223B]" />
            <p className="mt-1 text-[8px] uppercase tracking-wider text-[#8892A0]">
              Authorised signature
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SheetSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#F26A21]">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">{children}</div>
    </div>
  );
}

/** A labelled rule to write on, sized for an adult's handwriting. */
function WriteRow({
  label,
  hint,
  span,
}: {
  label: string;
  hint?: string;
  span?: 1 | 2;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : undefined}>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-medium text-[#16223B]">{label}</span>
        {hint && <span className="text-[8px] text-[#8892A0]">{hint}</span>}
      </div>
      <div className="mt-2.5 border-b border-[#16223B]" />
    </div>
  );
}

/**
 * One box per character.
 *
 * A phone number written freehand over a rule is the single most common thing
 * an admin mistypes off these sheets, and a wrong digit means the centre
 * cannot reach the family at all.
 */
function BoxRow({
  label,
  boxes,
  note,
  required,
}: {
  label: string;
  boxes: number;
  note?: string;
  required?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-medium text-[#16223B]">
          {label}
          {required && <span className="text-[#F26A21]"> *</span>}
        </span>
        {note && <span className="text-[8px] text-[#8892A0]">{note}</span>}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {Array.from({ length: boxes }, (_, index) => (
          <div
            key={index}
            className="h-[22px] flex-1 rounded-[2px] border border-[#16223B]"
          />
        ))}
      </div>
    </div>
  );
}

function StubRow({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-medium text-[#16223B]">{label}</span>
        {hint && <span className="text-[8px] text-[#8892A0]">{hint}</span>}
      </div>
      <div className="mt-2 border-b border-dotted border-[#16223B]" />
    </div>
  );
}

function TearLine() {
  return (
    <div className="relative mx-5 my-1 flex items-center">
      <div className="flex-1 border-t border-dashed border-[#8892A0]" />
      <span className="px-2 text-[8px] uppercase tracking-wider text-[#8892A0]">
        ✂ tear here
      </span>
      <div className="flex-1 border-t border-dashed border-[#8892A0]" />
    </div>
  );
}
