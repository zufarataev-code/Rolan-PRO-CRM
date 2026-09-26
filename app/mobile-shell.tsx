import React from 'react';
import { mobileNavigation } from './mobile-navigation';

const MobileShell = () => {
  return (
    <div className="mobile-shell">
      <nav>
        <ul>
          {mobileNavigation.items.map(item => (
            <li key={item.name}>
              <a href={item.route}>{item.name}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default MobileShell;

