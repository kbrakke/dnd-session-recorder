'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { BookOpen, Plus, Edit3, Trash2, Calendar } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TextInput, Textarea } from '@/components/forms';
import { campaignSchema, type CampaignFormData } from './schema';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  created_at: string;
  updated_at: string;
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      description: '',
      systemPrompt: '',
    },
  });

  useEffect(() => {
    if (modalOpen && editingCampaign) {
      reset({
        name: editingCampaign.name,
        description: editingCampaign.description || '',
        systemPrompt: editingCampaign.systemPrompt || '',
      });
    } else if (modalOpen) {
      reset({ name: '', description: '', systemPrompt: '' });
    }
  }, [modalOpen, editingCampaign, reset]);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create campaign');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      closeModal();
    },
    onError: (error) => {
      setError('root', { message: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CampaignFormData }) => {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update campaign');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      closeModal();
    },
    onError: (error) => {
      setError('root', { message: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete campaign');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const onSubmit = (data: CampaignFormData) => {
    if (editingCampaign) {
      updateMutation.mutate({ id: editingCampaign.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingCampaign(null);
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      deleteMutation.mutate(id);
    }
  };

  const openCreateModal = () => {
    setEditingCampaign(null);
    setModalOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="font-display text-4xl font-semibold text-slate-900 m-0">Campaigns</h1>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus size={16} /> New Campaign
        </Button>
      </div>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 mt-2">Loading campaigns...</p>
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="bg-white border border-slate-300 rounded-ss-xl p-12 text-center shadow-ss-card">
          <BookOpen className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <h3 className="font-display text-xl font-semibold text-slate-900 mb-1.5">No campaigns yet</h3>
          <p className="font-body text-sm text-slate-500 mb-4">Create your first campaign to organize sessions</p>
          <Button onClick={openCreateModal}>Create Campaign</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white rounded-ss-xl border border-slate-300 shadow-ss-card hover:shadow-ss-card-hover transition-shadow duration-150">
              <Link href={`/campaigns/${campaign.id}`}>
                <div className="p-6 cursor-pointer">
                  <h3 className="font-display text-[22px] font-semibold text-slate-900 m-0 mb-2">{campaign.name}</h3>
                  {campaign.description && (
                    <p className="font-body text-sm text-slate-600 leading-relaxed mb-3.5 line-clamp-3">{campaign.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 font-body text-[13px] text-slate-400">
                    <Calendar size={14} />
                    <span>Created {formatDate(campaign.created_at)}</span>
                  </div>
                </div>
              </Link>
              <div className="flex gap-2 px-6 py-3.5 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    handleEdit(campaign);
                  }}
                  className="flex-1 gap-1"
                >
                  <Edit3 size={14} /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(campaign.id);
                  }}
                  className="text-red-800 border-red-200 hover:bg-red-50 hover:border-red-300"
                >
                  <Trash2 size={14} /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-ss-2xl max-w-lg w-full p-7 border border-slate-300 shadow-ss-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-[26px] font-semibold text-slate-900 m-0 mb-5">
              {editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {errors.root && (
                <div className="rounded-ss-lg bg-red-50 border border-red-200 p-3">
                  <div className="text-sm text-red-900 font-medium">{errors.root.message}</div>
                </div>
              )}

              <TextInput
                {...register('name')}
                id="campaign-name"
                label="Campaign Name"
                error={errors.name?.message}
                placeholder="The Lost Mines of Phandelver"
              />

              <Textarea
                {...register('description')}
                id="campaign-description"
                label="Description"
                error={errors.description?.message}
                rows={3}
                placeholder="A classic starter adventure in the Forgotten Realms"
              />

              <Textarea
                {...register('systemPrompt')}
                id="campaign-systemPrompt"
                label="System Prompt (Optional)"
                error={errors.systemPrompt?.message}
                rows={4}
                placeholder="Characters, setting, recurring NPCs — helps the AI ground summaries"
                helperText="This context helps the AI generate more accurate summaries."
              />

              <div className="flex gap-2.5 pt-1">
                <Button
                  type="submit"
                  disabled={isMutating}
                  className="flex-1"
                >
                  {isMutating ? 'Saving...' :
                   editingCampaign ? 'Update Campaign' : 'Create Campaign'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
