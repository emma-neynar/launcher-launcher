import type { Metadata } from 'next';
import { loadRegistry } from '@/src/registry';
import { Home } from '../../home';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

type Props = { params: Promise<{ id: string }> };

/**
 * Shareable launcher route (registry id, e.g. /l/hood-factory): cast this URL
 * and it renders as a launchable Mini App card that opens straight into this
 * launcher's launch screen. The card carries the launcher's actual name so a
 * shared link reads as THAT launcher, not a generic app install.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const url = `${APP_URL}/l/${id}`;

  let launcherName: string | undefined;
  try {
    launcherName = (await loadRegistry()).find((l) => l.id === id)?.name;
  } catch {
    /* registry unreachable — fall back to the generic card */
  }

  // Farcaster caps embed button titles at 32 chars; fall back when the
  // personalized title wouldn't fit.
  const personalized = launcherName && `launch thru “${launcherName}”`;
  const buttonTitle =
    personalized && personalized.length <= 32 ? personalized : 'launch through this one, dawg';

  const embed = {
    version: '1',
    imageUrl: `${APP_URL}/embed-image.png`,
    button: {
      title: buttonTitle,
      action: {
        type: 'launch_miniapp',
        name: 'YO DAWG',
        url,
        splashImageUrl: `${APP_URL}/splash.png`,
        splashBackgroundColor: '#8a63d2',
      },
    },
  };
  return {
    title: launcherName ? `YO DAWG — “${launcherName}”` : 'YO DAWG — launcher launcher',
    description: launcherName
      ? `launch a token through “${launcherName}” — paired with $HOODIE, locked at the choke point.`
      : 'launch a token through this launcher — paired with $HOODIE, locked at the choke point.',
    other: {
      'fc:miniapp': JSON.stringify(embed),
      'fc:frame': JSON.stringify({
        ...embed,
        button: { ...embed.button, action: { ...embed.button.action, type: 'launch_frame' } },
      }),
    },
  };
}

export default async function LauncherPage({ params }: Props) {
  const { id } = await params;
  return <Home initialLauncherId={id} />;
}
