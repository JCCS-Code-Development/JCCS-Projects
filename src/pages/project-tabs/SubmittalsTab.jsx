import SubmittalsBoard from '../../components/SubmittalsBoard'
import { listSubmittals, listSubmittalVersions, createSubmittal, updateSubmittalStatus, addSubmittalVersion } from '../../api/submittals'

export default function SubmittalsTab({ projectNumber, targetSubmittalId }) {
  return (
    <SubmittalsBoard projectNumber={projectNumber} targetSubmittalId={targetSubmittalId}
      fetchSubmittals={listSubmittals} fetchVersions={listSubmittalVersions}
      createSubmittal={createSubmittal} updateStatus={updateSubmittalStatus} addVersion={addSubmittalVersion} />
  )
}
