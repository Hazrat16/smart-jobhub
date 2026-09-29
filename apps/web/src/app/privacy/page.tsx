export default function PrivacyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-3xl space-y-4 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
        <p className="text-fg-muted">
          We collect account, profile, and application data to operate the hiring platform.
          We do not sell personal data. Access is restricted to authorized staff.
        </p>
        <p className="text-fg-muted">
          You can request account-data deletion from your profile settings. Approved requests are
          tracked and processed by administrators.
        </p>
      </div>
    </div>
  );
}
