import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import CopyButton from '@app/components/Settings/CopyButton';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserApiKey',
  {
    apikey: 'API Key',
    noApiKey: 'No API key has been generated yet.',
    generateApiKey: 'Generate API Key',
    regenerateApiKey: 'Regenerate',
    revokeApiKey: 'Revoke',
    apikeyCopied: 'API key copied to clipboard.',
    toastGenerateSuccess: 'API key generated successfully!',
    toastGenerateFailure: 'Something went wrong while generating the API key.',
    toastRevokeSuccess: 'API key revoked successfully!',
    toastRevokeFailure: 'Something went wrong while revoking the API key.',
    apiKeyVisibilityWarning:
      'Copy your API key now. It will not be shown again.',
  }
);

const UserApiKey = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const router = useRouter();
  const { user } = useUser({ id: Number(router.query.userId) });
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<{ hasApiKey: boolean }>(
    user ? `/api/v1/user/${user?.id}/settings/api-key` : null
  );
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={500} />;
  }

  const generateKey = async () => {
    setIsGenerating(true);
    try {
      const res = await axios.post<{ apiKey: string }>(
        `/api/v1/user/${user?.id}/settings/api-key`
      );
      setCurrentKey(res.data.apiKey);
      revalidate();
      addToast(intl.formatMessage(messages.toastGenerateSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.toastGenerateFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const revokeKey = async () => {
    setIsRevoking(true);
    try {
      await axios.delete(`/api/v1/user/${user?.id}/settings/api-key`);
      setCurrentKey(null);
      revalidate();
      addToast(intl.formatMessage(messages.toastRevokeSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.toastRevokeFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.apikey),
          intl.formatMessage(globalMessages.usersettings),
          user?.displayName,
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.apikey)}</h3>
      </div>
      <div className="section">
        {currentKey ? (
          <>
            <p className="mb-4 text-sm text-gray-400">
              {intl.formatMessage(messages.apiKeyVisibilityWarning)}
            </p>
            <div className="form-row">
              <label htmlFor="apiKey" className="text-label">
                {intl.formatMessage(messages.apikey)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SensitiveInput
                    type="text"
                    id="apiKey"
                    className="rounded-l-only"
                    value={currentKey}
                    readOnly
                  />
                  <CopyButton
                    textToCopy={currentKey}
                    toastMessage={intl.formatMessage(messages.apikeyCopied)}
                    key={currentKey}
                  />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      generateKey();
                    }}
                    className="input-action"
                    type="button"
                    disabled={isGenerating}
                  >
                    <ArrowPathIcon />
                  </button>
                </div>
              </div>
            </div>
            <div className="actions">
              <div className="flex justify-end">
                <span className="ml-3 inline-flex rounded-md shadow-sm">
                  <Button
                    buttonType="danger"
                    onClick={revokeKey}
                    disabled={isRevoking}
                  >
                    <TrashIcon />
                    <span>{intl.formatMessage(messages.revokeApiKey)}</span>
                  </Button>
                </span>
              </div>
            </div>
          </>
        ) : data.hasApiKey ? (
          <div className="form-row">
            <label htmlFor="apiKey" className="text-label">
              {intl.formatMessage(messages.apikey)}
            </label>
            <div className="form-input-area">
              <div className="flex gap-2">
                <Button
                  buttonType="warning"
                  onClick={generateKey}
                  disabled={isGenerating}
                >
                  <ArrowPathIcon />
                  <span>{intl.formatMessage(messages.regenerateApiKey)}</span>
                </Button>
                <Button
                  buttonType="danger"
                  onClick={revokeKey}
                  disabled={isRevoking}
                >
                  <TrashIcon />
                  <span>{intl.formatMessage(messages.revokeApiKey)}</span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="form-row">
            <label className="text-label">
              {intl.formatMessage(messages.apikey)}
            </label>
            <div className="form-input-area">
              <p className="mb-4 text-sm text-gray-400">
                {intl.formatMessage(messages.noApiKey)}
              </p>
              <Button
                buttonType="primary"
                onClick={generateKey}
                disabled={isGenerating}
              >
                <span>{intl.formatMessage(messages.generateApiKey)}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default UserApiKey;
