import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { PageBanner } from '../design'
import { BulkEditTab } from './Admin'

export default function BulkEdit() {
  const { student } = useOutletContext()
  const [locations, setLocations] = useState([])

  useEffect(() => {
    supabase.from('locations').select('*').order('room').then(({ data }) => {
      if (data) setLocations(data)
    })
  }, [])

  return (
    <div>
      <PageBanner title="시약 일괄 정리" sub="Bulk Edit" breadcrumb={['홈', '시약 일괄정리']} />
      <div style={{ padding: '20px 40px' }}>
        <BulkEditTab locations={locations} student={student} />
      </div>
    </div>
  )
}
