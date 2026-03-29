import { useState, useEffect } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
)

const API_BASE = import.meta.env.VITE_API_TARGET || ''

interface ScoreBucket {
  bucket: string
  count: number
}

interface PassRateItem {
  task: string
  avg_score: number
  attempts: number
}

interface TimelineItem {
  date: string
  submissions: number
}

interface LabItem {
  id: number
  type: string
  title: string
}

export default function Dashboard() {
  const [token] = useState(() => localStorage.getItem('api_key') ?? '')
  const [labs, setLabs] = useState<LabItem[]>([])
  const [selectedLab, setSelectedLab] = useState<string>('')
  const [scores, setScores] = useState<ScoreBucket[]>([])
  const [passRates, setPassRates] = useState<PassRateItem[]>([])
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch labs on mount
  useEffect(() => {
    fetch(`${API_BASE}/items/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: LabItem[]) => {
        const labItems = data.filter((item) => item.type === 'lab')
        setLabs(labItems)
        if (labItems.length > 0) {
          // Extract lab ID from title (e.g., "Lab 04 — Testing" -> "lab-04")
          const firstLab = labItems[0]
          const match = firstLab.title.match(/Lab (\d+)/i)
          if (match) {
            setSelectedLab(`lab-${match[1].toLowerCase()}`)
          }
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [token])

  // Fetch analytics data when lab changes
  useEffect(() => {
    if (!selectedLab) return

    setLoading(true)
    setError(null)

    Promise.all([
      fetch(`${API_BASE}/analytics/scores?lab=${selectedLab}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE}/analytics/pass-rates?lab=${selectedLab}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE}/analytics/timeline?lab=${selectedLab}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])
      .then(([scoresRes, passRatesRes, timelineRes]) => {
        if (!scoresRes.ok) throw new Error(`Scores: HTTP ${scoresRes.status}`)
        if (!passRatesRes.ok)
          throw new Error(`Pass rates: HTTP ${passRatesRes.status}`)
        if (!timelineRes.ok) throw new Error(`Timeline: HTTP ${timelineRes.status}`)
        return Promise.all([
          scoresRes.json(),
          passRatesRes.json(),
          timelineRes.json(),
        ])
      })
      .then(([scoresData, passRatesData, timelineData]) => {
        setScores(scoresData as ScoreBucket[])
        setPassRates(passRatesData as PassRateItem[])
        setTimeline(timelineData as TimelineItem[])
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [selectedLab, token])

  // Bar chart data for scores
  const barChartData = {
    labels: scores.map((s) => s.bucket),
    datasets: [
      {
        label: 'Number of Students',
        data: scores.map((s) => s.count),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  }

  // Line chart data for timeline
  const lineChartData = {
    labels: timeline.map((t) => t.date),
    datasets: [
      {
        label: 'Submissions',
        data: timeline.map((t) => t.submissions),
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: true,
        tension: 0.1,
      },
    ],
  }

  if (!token) {
    return <p>Please connect with your API key first.</p>
  }

  if (loading) {
    return <p>Loading dashboard...</p>
  }

  if (error) {
    return <p>Error: {error}</p>
  }

  return (
    <div className="dashboard">
      <div className="lab-selector">
        <label htmlFor="lab-select">Select Lab: </label>
        <select
          id="lab-select"
          value={selectedLab}
          onChange={(e) => setSelectedLab(e.target.value)}
        >
          {labs.map((lab) => {
            const match = lab.title.match(/Lab (\d+)/i)
            const labId = match ? `lab-${match[1].toLowerCase()}` : ''
            return (
              <option key={lab.id} value={labId}>
                {lab.title}
              </option>
            )
          })}
        </select>
      </div>

      {selectedLab && (
        <>
          <section className="chart-section">
            <h2>Score Distribution</h2>
            {scores.length > 0 ? (
              <Bar data={barChartData} options={{ responsive: true }} />
            ) : (
              <p>No score data available</p>
            )}
          </section>

          <section className="chart-section">
            <h2>Submissions Over Time</h2>
            {timeline.length > 0 ? (
              <Bar data={lineChartData} options={{ responsive: true }} />
            ) : (
              <p>No timeline data available</p>
            )}
          </section>

          <section className="table-section">
            <h2>Pass Rates by Task</h2>
            {passRates.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Avg Score</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {passRates.map((pr) => (
                    <tr key={pr.task}>
                      <td>{pr.task}</td>
                      <td>{pr.avg_score}</td>
                      <td>{pr.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No pass rate data available</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
