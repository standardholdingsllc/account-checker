export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          Account Closure Finder
        </h1>
        <div className="text-center">
          <p className="text-lg mb-4">
            Automated dormant account monitoring system
          </p>
          <p className="text-sm text-gray-600">
            This system runs automated checks on weekdays to monitor dormant accounts
            and sends alerts to the team Slack channel.
          </p>
          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Monitoring Rules:</h2>
            <ul className="text-left text-sm space-y-1">
              <li>• Accounts with activity: Alert at 9 months, Close at 12 months</li>
              <li>• Accounts with no activity: Close at 120 days</li>
              <li>• Checks run on weekdays only</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
