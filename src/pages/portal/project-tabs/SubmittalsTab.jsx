import SubmittalsBoard from '../../../components/SubmittalsBoard'
import { listPortalSubmittals, getPortalSubmittalVersions } from '../../../api/portal'

// Read-only mirror of the staff Submittals tab — no createSubmittal/
// updateStatus/addVersion passed in, so SubmittalsBoard renders status
// badges + version history only, no review workflow.
export default function SubmittalsTab({ projectNumber, targetSubmittalId }) {
  return (
    <SubmittalsBoard projectNumber={projectNumber} targetSubmittalId={targetSubmittalId}
      fetchSubmittals={listPortalSubmittals} fetchVersions={getPortalSubmittalVersions} />
  )
}
