import { useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Image from 'next/image';
import { useRouter } from 'next/router';
import RegistrationForm from '../../components/RegistrationForm';
import { UserInfo } from '../../types/types';
import { CONTACT_EMAIL } from '../../utils/constants';
import { validateEndorsementSettings } from '../../utils/endorsement';
import { readSessionId } from '../../utils/endorsementSession';
import { getApplication, getEndorsementSettings } from '../../utils/endorsementStore';

interface EndorseHomeProps {
  isOpen: boolean;
}

const EndorseHome = ({ isOpen }: EndorseHomeProps) => {
  const router = useRouter();

  const handleRegister = useCallback(async (info: UserInfo) => {
    try {
      const response = await fetch('/api/endorsement/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      });
      if (!response.ok) {
        return (await response.json().catch(() => null))?.message ?? 'Something went wrong. Please try again.';
      }
    } catch {
      return "We couldn't reach the server. Please check your internet connection.";
    }
    router.push('/endorse/instructions');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <Image
          src="/legends-logo.png"
          alt="Legends Logo"
          width={400}
          height={236}
          priority
          className="mx-auto w-full max-w-[400px] h-auto"
        />
        <div>
          <h2 className="font-pontiac mt-6 text-center text-4xl text-white">
            DDN Legends<br />Judge Endorsement
          </h2>
          <p className="mt-2 text-center text-lg text-gray-300">
            {isOpen ? 'Register to begin your application' : "Applications aren't open right now."}
          </p>
        </div>
        {isOpen ? (
          <RegistrationForm onRegister={handleRegister} />
        ) : (
          <p className="text-center text-gray-300">
            Questions? Contact{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-400 underline hover:text-indigo-300">{CONTACT_EMAIL}</a>.
          </p>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<EndorseHomeProps> = async ({ req }) => {
  // A judge who has already registered in this browser goes straight back to their application.
  const id = readSessionId(req.cookies);
  if (id && (await getApplication(id))) {
    return { redirect: { destination: '/endorse/instructions', permanent: false } };
  }
  const settings = await getEndorsementSettings();
  return { props: { isOpen: validateEndorsementSettings(settings) === null } };
};

export default EndorseHome;
