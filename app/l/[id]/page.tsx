import type { Metadata } from 'next';
import { isAddress } from 'viem';
import { Home } from '../../home';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

type Props = { params: Promise<{ address: string }> };

/**
 * Shareable launcher route: cast this URL and it renders as a launchable
 * Mini App card that opens straight into this launcher.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const url = `${APP_URL}/l/${address}`;
  const embed = {
    version: '1',
    imageUrl: `${APP_URL}/embed-image.png`,
    button: {
      title: 'launch through this one, dawg',
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
    title: 'YO DAWG — launcher launcher',
    description:
      'launch a token through this launcher — paired with $HOODIE, locked at the contract level.',
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
  const { address } = await params;
  return <Home initialLauncher={isAddress(address) ? (address as `0x${string}`) : undefined} />;
}
