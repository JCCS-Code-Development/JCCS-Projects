import PunchListBoard from '../../components/PunchListBoard'
import { listPunchItems, createPunchItem, updatePunchItemStatus, addPunchItemPhoto } from '../../api/punchItems'

export default function PunchListTab({ projectNumber, targetItemId }) {
  return (
    <PunchListBoard projectNumber={projectNumber} targetItemId={targetItemId}
      fetchItems={listPunchItems} createItem={createPunchItem}
      updateStatus={updatePunchItemStatus} addPhoto={addPunchItemPhoto} />
  )
}
