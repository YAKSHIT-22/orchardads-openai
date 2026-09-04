/**
 * "Beta" badge shown beside the wordmark.
 *
 * This is a truth-in-labelling device, not decoration: no mapping in this
 * product has been exercised against a live api.ads.openai.com account yet
 * (see docs/VERIFICATION.md), so users should know the surface is provisional
 * before they act on a recommendation.
 *
 * Sized in em so it tracks whatever type scale the surrounding logo uses.
 */
export function BetaTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "select-none rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 " +
        "text-[10px] font-medium uppercase leading-none tracking-wide text-primary " +
        className
      }
    >
      Beta
    </span>
  );
}
