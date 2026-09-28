import './index.css';
import { Composition, Folder } from 'remotion';
import { DURATION, Promo } from './Promo';
import { Hook } from './scenes/Hook';
import { Join } from './scenes/Join';
import { LiveInk } from './scenes/LiveInk';
import { Outro } from './scenes/Outro';
import { Private } from './scenes/Private';
import { Title } from './scenes/Title';
import { Together } from './scenes/Together';
import { Tools } from './scenes/Tools';
import { FPS, HEIGHT, WIDTH } from './theme';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Promo" component={Promo} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={DURATION} />
    <Folder name="Scenes">
      <Composition id="Hook" component={Hook} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={180} />
      <Composition id="Title" component={Title} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={120} />
      <Composition id="Join" component={Join} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={240} />
      <Composition id="LiveInk" component={LiveInk} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={300} />
      <Composition id="Tools" component={Tools} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={270} />
      <Composition id="Together" component={Together} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={240} />
      <Composition id="Private" component={Private} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={180} />
      <Composition id="Outro" component={Outro} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={150} />
    </Folder>
  </>
);
