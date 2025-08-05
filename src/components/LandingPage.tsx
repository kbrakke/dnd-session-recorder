'use client';

import Link from 'next/link';
import { Calendar, Clock, Mic, Plus, BookOpen, FileText, Sparkles, TrendingUp, Activity, Users, LogIn, Star, Shield, Zap } from 'lucide-react';
import Button from '@/components/ui/Button';

// Mock data for showcase
const mockCampaigns = [
  {
    id: '1',
    name: 'The Lost Mines of Phandelver',
    description: 'A classic starter adventure in the Forgotten Realms',
    sessions: 8,
    lastSession: '2024-01-15',
    status: 'active'
  },
  {
    id: '2', 
    name: 'Curse of Strahd',
    description: 'Gothic horror in the realm of Barovia',
    sessions: 15,
    lastSession: '2024-01-12',
    status: 'active'
  },
  {
    id: '3',
    name: 'Waterdeep: Dragon Heist',
    description: 'Urban intrigue in the City of Splendors',
    sessions: 12,
    lastSession: '2024-01-08',
    status: 'completed'
  }
];

const mockSessions = [
  {
    id: '1',
    title: 'The Goblin Ambush',
    campaign: 'The Lost Mines of Phandelver',
    date: '2024-01-15',
    duration: '3h 45m',
    status: 'completed',
    transcriptions: 127,
    summary: true
  },
  {
    id: '2',
    title: 'Meeting Madam Eva',
    campaign: 'Curse of Strahd',
    date: '2024-01-12', 
    duration: '4h 12m',
    status: 'completed',
    transcriptions: 156,
    summary: true
  },
  {
    id: '3',
    title: 'The Tavern Brawl',
    campaign: 'Waterdeep: Dragon Heist',
    date: '2024-01-08',
    duration: '2h 30m', 
    status: 'completed',
    transcriptions: 89,
    summary: true
  },
  {
    id: '4',
    title: 'Exploring the Manor',
    campaign: 'Curse of Strahd',
    date: '2024-01-05',
    duration: '3h 15m',
    status: 'processing',
    transcriptions: 0,
    summary: false
  }
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200';
    case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'active': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export default function LandingPage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold mb-4">
            AI-Powered D&D Session Recording
          </h1>
          <p className="text-blue-100 text-xl mb-8">
            Transform your tabletop adventures with automatic transcription, intelligent summaries, and comprehensive campaign management
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link href="/auth/signup">
              <Button className="bg-white text-blue-600 hover:bg-gray-100 flex items-center space-x-2 px-8 py-3 text-lg">
                <Plus className="h-5 w-5" />
                <span>Start Recording Free</span>
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 flex items-center space-x-2 px-8 py-3 text-lg">
                <LogIn className="h-5 w-5" />
                <span>Sign In</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Demo Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Sessions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">35</p>
              <p className="text-sm text-green-600 mt-1">
                <TrendingUp className="h-4 w-4 inline mr-1" />
                Sample Data
              </p>
            </div>
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
              <Mic className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Campaigns</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">3</p>
              <p className="text-sm text-green-600 mt-1">
                <Users className="h-4 w-4 inline mr-1" />
                Demo
              </p>
            </div>
            <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
              <BookOpen className="h-7 w-7 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Hours Recorded</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">124h</p>
              <p className="text-sm text-green-600 mt-1">
                <Activity className="h-4 w-4 inline mr-1" />
                Sample
              </p>
            </div>
            <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
              <Clock className="h-7 w-7 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">AI Summaries</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">31</p>
              <p className="text-sm text-green-600 mt-1">
                <Sparkles className="h-4 w-4 inline mr-1" />
                Generated
              </p>
            </div>
            <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Mic className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">AI Transcription</h3>
          <p className="text-gray-600 mb-4">
            Automatically convert your D&D session audio into accurate, searchable text transcripts with speaker identification.
          </p>
          <ul className="text-sm text-gray-500 text-left space-y-2">
            <li className="flex items-center"><Star className="h-4 w-4 text-yellow-500 mr-2" />99.1% accuracy rate</li>
            <li className="flex items-center"><Star className="h-4 w-4 text-yellow-500 mr-2" />Speaker identification</li>
            <li className="flex items-center"><Star className="h-4 w-4 text-yellow-500 mr-2" />Real-time processing</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="h-8 w-8 text-purple-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Smart Summaries</h3>
          <p className="text-gray-600 mb-4">
            Generate concise summaries with key events, character interactions, and plot developments using advanced AI.
          </p>
          <ul className="text-sm text-gray-500 text-left space-y-2">
            <li className="flex items-center"><Zap className="h-4 w-4 text-purple-500 mr-2" />Key event extraction</li>
            <li className="flex items-center"><Zap className="h-4 w-4 text-purple-500 mr-2" />Character tracking</li>
            <li className="flex items-center"><Zap className="h-4 w-4 text-purple-500 mr-2" />Plot continuity</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Campaign Management</h3>
          <p className="text-gray-600 mb-4">
            Organize multiple campaigns, track session history, and maintain comprehensive adventure records.
          </p>
          <ul className="text-sm text-gray-500 text-left space-y-2">
            <li className="flex items-center"><Shield className="h-4 w-4 text-green-500 mr-2" />Secure cloud storage</li>
            <li className="flex items-center"><Shield className="h-4 w-4 text-green-500 mr-2" />Multi-campaign support</li>
            <li className="flex items-center"><Shield className="h-4 w-4 text-green-500 mr-2" />Export capabilities</li>
          </ul>
        </div>
      </div>

      {/* Demo Campaigns */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Sample Campaigns</h2>
          <p className="text-gray-600">See how your campaigns could look with our platform</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {mockCampaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">{campaign.name}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(campaign.status)}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm mb-3">{campaign.description}</p>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="text-xl font-bold text-blue-600">{campaign.sessions}</div>
                      <div className="text-xs text-gray-500">Sessions</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-xl font-bold text-green-600">
                        {new Date(campaign.lastSession).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-gray-500">Last Session</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Sessions */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Recent Session Examples</h2>
          <p className="text-gray-600">Preview of how your session records would appear</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {mockSessions.map((session) => (
            <div key={session.id} className="bg-white border border-gray-200 rounded-xl p-6 opacity-75">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{session.title}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(session.status)}`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                    <div className="flex items-center">
                      <BookOpen className="h-4 w-4 mr-1 text-green-600" />
                      <span>{session.campaign}</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1 text-blue-600" />
                      <span>{new Date(session.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-blue-600">{session.transcriptions}</div>
                      <div className="text-xs text-gray-500">Transcriptions</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-green-600">{session.duration}</div>
                      <div className="text-xs text-gray-500">Duration</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-purple-600">{session.summary ? '✓' : '—'}</div>
                      <div className="text-xs text-gray-500">Summary</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  {session.status === 'completed' && (
                    <>
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm flex items-center space-x-1">
                        <FileText className="h-4 w-4" />
                        <span>Transcript</span>
                      </span>
                      {session.summary && (
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm flex items-center space-x-1">
                          <Sparkles className="h-4 w-4" />
                          <span>Summary</span>
                        </span>
                      )}
                    </>
                  )}
                  {session.status === 'processing' && (
                    <div className="flex items-center space-x-2 text-blue-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm">Processing...</span>
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-400">
                  Demo Data
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white text-center">
        <h3 className="text-3xl font-bold mb-4">Ready to Transform Your D&D Sessions?</h3>
        <p className="text-indigo-100 mb-8 max-w-2xl mx-auto text-lg">
          Join thousands of Dungeon Masters who never miss a moment with AI-powered session recording and campaign management.
        </p>
        <div className="flex items-center justify-center space-x-4">
          <Link href="/auth/signup">
            <Button className="bg-white text-indigo-600 hover:bg-gray-100 flex items-center space-x-2 px-8 py-3 text-lg">
              <Plus className="h-5 w-5" />
              <span>Create Free Account</span>
            </Button>
          </Link>
          <Link href="/auth/signin">
            <Button variant="outline" className="border-white text-white hover:bg-white hover:text-indigo-600 flex items-center space-x-2 px-8 py-3 text-lg">
              <LogIn className="h-5 w-5" />
              <span>Sign In</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}