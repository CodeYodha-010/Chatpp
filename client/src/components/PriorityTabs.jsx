import { motion } from 'motion/react';

function PriorityTabs({ messages, activeFilter, onFilterChange, onOpenSearch }) {
  const counts = {
    all: messages.length,
    urgent: messages.filter(m => m.priority === 'urgent').length,
    fyi: messages.filter(m => m.priority === 'fyi').length,
    social: messages.filter(m => m.priority === 'social').length
  };

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'fyi', label: 'FYI' },
    { id: 'social', label: 'Social' }
  ];

  return (
    <div className="priority-tabs">
      {tabs.map((tab) => (
        <motion.button
          key={tab.id}
          className={`tab ${activeFilter === tab.id ? 'active' : ''}`}
          onClick={() => onFilterChange(tab.id)}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', duration: 0.2, bounce: 0.1 }}
        >
          {tab.label}
          <span className="tab-count">{counts[tab.id]}</span>
        </motion.button>
      ))}
      <div className="tabs-spacer" />
      <motion.button
        className="tab-search-btn"
        onClick={onOpenSearch}
        title="Search"
        whileTap={{ scale: 0.97 }}
      >
        Search <kbd>⌘K</kbd>
      </motion.button>
    </div>
  );
}

export default PriorityTabs;
