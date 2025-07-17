'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';

const errorMessages = {
  'Configuration': 'There is a problem with the server configuration.',
  'AccessDenied': 'Access denied. You do not have permission to sign in.',
  'Verification': 'The verification token has expired or has already been used.',
  'OAuthSignin': 'Error in constructing an authorization URL.',
  'OAuthCallback': 'Error in handling the response from an OAuth provider.',
  'OAuthCreateAccount': 'Could not create OAuth account in the database.',
  'EmailCreateAccount': 'Could not create email account in the database.',
  'Callback': 'Error in the OAuth callback handler route.',
  'OAuthAccountNotLinked': 'The account is not linked. To confirm your identity, sign in with the same account you used originally.',
  'EmailSignin': 'Sending the e-mail with the verification token failed.',
  'CredentialsSignin': 'Authorization failed. Check the details you provided are correct.',
  'SessionRequired': 'You must be signed in to access this page.',
  'Default': 'An unexpected error occurred during authentication.',
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Default';
  
  const errorMessage = errorMessages[error as keyof typeof errorMessages] || errorMessages.Default;

  // Log the error for debugging
  console.error('Authentication error:', { error, errorMessage });

  const getErrorTitle = (error: string) => {
    switch (error) {
      case 'OAuthCallback':
      case 'Callback':
        return 'OAuth Authentication Failed';
      case 'AccessDenied':
        return 'Access Denied';
      case 'OAuthAccountNotLinked':
        return 'Account Not Linked';
      case 'CredentialsSignin':
        return 'Sign In Failed';
      default:
        return 'Authentication Error';
    }
  };

  const getErrorDetails = (error: string) => {
    switch (error) {
      case 'OAuthCallback':
      case 'Callback':
        return 'There was an issue with the Google OAuth callback. This might be due to misconfigured redirect URIs or temporary server issues.';
      case 'AccessDenied':
        return 'You cancelled the authentication process or access was denied by the OAuth provider.';
      case 'OAuthAccountNotLinked':
        return 'This account is associated with a different sign-in method. Please use the original method you used to create your account.';
      case 'CredentialsSignin':
        return 'The email or password you entered is incorrect. Please check your credentials and try again.';
      default:
        return 'An unexpected error occurred during the authentication process. Please try again.';
    }
  };

  const getSuggestedActions = (error: string) => {
    switch (error) {
      case 'OAuthCallback':
      case 'Callback':
        return [
          'Try signing in again',
          'Clear your browser cache and cookies',
          'Check if you have any browser extensions blocking OAuth',
          'Try using a different browser',
        ];
      case 'AccessDenied':
        return [
          'Try signing in again',
          'Make sure you click "Allow" when prompted by Google',
          'Check that your Google account is not restricted',
        ];
      case 'OAuthAccountNotLinked':
        return [
          'Try signing in with your original method (email/password)',
          'If you forgot your password, use the password reset feature',
          'Contact support if you need help linking accounts',
        ];
      case 'CredentialsSignin':
        return [
          'Double-check your email and password',
          'Make sure Caps Lock is not enabled',
          'Try resetting your password if you forgot it',
        ];
      default:
        return [
          'Try signing in again',
          'Clear your browser cache and cookies',
          'Try using a different browser',
          'Contact support if the issue persists',
        ];
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            {getErrorTitle(error)}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Error Code: {error}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">What happened?</h3>
            <p className="text-gray-600">{getErrorDetails(error)}</p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Suggested actions:</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              {getSuggestedActions(error).map((action, index) => (
                <li key={index}>{action}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col space-y-3">
          <Link href="/auth/signin">
            <Button className="w-full flex items-center justify-center">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </Link>
          
          <Link href="/">
            <Button variant="outline" className="w-full flex items-center justify-center">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-500">
            Need help? Contact support with error code: <span className="font-mono bg-gray-100 px-1 rounded">{error}</span>
          </p>
        </div>
      </div>
    </div>
  );
}