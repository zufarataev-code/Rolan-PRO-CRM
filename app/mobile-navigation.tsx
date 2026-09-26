// Mobile navigation structure
import React from 'react';
import { TodayScreen, LeadsList, ProjectsList } from './screens';

export default function MobileNavigation() {
  return (
    <nav>
      <ul>
        <li><a href='#'>Today</a></li>
        <li><a href='#'>Leads</a></li>
        <li><a href='#'>Projects</a></li>
      </ul>
    </nav>
  );
}
