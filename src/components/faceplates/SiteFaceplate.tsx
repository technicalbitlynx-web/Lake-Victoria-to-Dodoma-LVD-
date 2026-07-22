import React from 'react';
import type { Site } from '../../types';
import IBPSFaceplate from './IBPSFaceplate';
import ReservoirFaceplate from './ReservoirFaceplate';
import IntakeFaceplate from './IntakeFaceplate';
import WTPFaceplate from './WTPFaceplate';
import OfftakeFaceplate from './OfftakeFaceplate';

interface Props { site: Site; }

export default function SiteFaceplate({ site }: Props) {
  switch (site.class) {
    case 'IBPS':
    case 'OFFTAKE_PUMPED':
      return <IBPSFaceplate site={site} />;
    case 'RESERVOIR':
      return <ReservoirFaceplate site={site} />;
    case 'INTAKE':
      return <IntakeFaceplate site={site} />;
    case 'WTP':
      return <WTPFaceplate site={site} />;
    case 'OFFTAKE_GRAVITY':
    case 'OFFTAKE_DUAL':
      return <OfftakeFaceplate site={site} />;
    default:
      return <div className="p-4 text-gray-500">No faceplate for class: {site.class}</div>;
  }
}
