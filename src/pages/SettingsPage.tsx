import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { SettingsView } from '../components/SettingsView'
import type { Profile } from '../types'
import { signalAppReady } from '../appReady'

export function SettingsPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data)
        signalAppReady()
      })
  }, [user])

  if (!profile) return <div className="loading-screen">Loading...</div>

  return (
    <SettingsView
      profile={profile}
      onClose={() => navigate('/')}
      onProfileUpdate={(p) => setProfile(p)}
    />
  )
}
