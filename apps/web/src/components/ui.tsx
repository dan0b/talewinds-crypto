import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatusDot({ ok }: { ok: boolean | undefined }) {
  const color = ok === undefined ? 'bg-muted' : ok ? 'bg-ok' : 'bg-bad';
  return <span aria-hidden className={`inline-block size-2 rounded-full ${color}`} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'border-border text-muted',
  ok: 'border-ok/40 text-ok',
  warn: 'border-warn/40 text-warn',
  bad: 'border-bad/40 text-bad',
  accent: 'border-accent/40 text-accent',
};

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-px text-[11px] leading-4 whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' };

export function Button({ variant = 'ghost', className = '', ...props }: ButtonProps) {
  const look =
    variant === 'primary'
      ? 'bg-accent text-canvas hover:opacity-90'
      : 'border border-border text-fg hover:bg-canvas';
  return (
    <button
      type="button"
      {...props}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
    />
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const NOTICE_TONES: Record<Exclude<Tone, 'accent' | 'ok'>, string> = {
  neutral: 'border-border',
  warn: 'border-warn/40',
  bad: 'border-bad/40',
};

const NOTICE_DOT: Record<Exclude<Tone, 'accent' | 'ok'>, string> = {
  neutral: 'bg-muted',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

export function Notice({
  tone = 'neutral',
  children,
  action,
}: {
  tone?: 'neutral' | 'warn' | 'bad';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-md border bg-surface px-3 py-2 text-sm ${NOTICE_TONES[tone]}`}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={`mt-1.5 inline-block size-1.5 shrink-0 rounded-full ${NOTICE_DOT[tone]}`}
        />
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}
