export default function TermsPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-3xl space-y-4 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
        <p className="text-fg-muted">
          By using JobPlatform, you agree to provide accurate information and avoid abusive,
          fraudulent, or harmful behavior.
        </p>
        <p className="text-fg-muted">
          We may suspend accounts or moderate content that violates platform rules. We reserve the
          right to remove jobs or applications that are spam, misleading, or unlawful.
        </p>
      </div>
    </div>
  );
}
