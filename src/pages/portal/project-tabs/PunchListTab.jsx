import PunchListBoard from '../../../components/PunchListBoard'
import { listPortalPunchItems, createPortalPunchItem } from '../../../api/portal'

// Clients CAN create punch items here (flagging something they spotted) —
// no updateStatus/addPhoto passed in, so PunchListBoard never shows the
// status control or "+ after photo" affordance; those stay staff-only.
export default function PunchListTab({ projectNumber, targetItemId }) {
  return (
    <PunchListBoard projectNumber={projectNumber} targetItemId={targetItemId}
      fetchItems={listPortalPunchItems} createItem={createPortalPunchItem} />
  )
}
