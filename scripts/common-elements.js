import { GraphRenderer } from 'graph-embedded-renderer';
import { createMathTooltips } from 'textip';

// Expose the original APIs for graphs and dynamic math in blog posts.
window.GraphRenderer = GraphRenderer;
window.mathTooltips = createMathTooltips({
  mathJax: { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] } }
});
window.MathJax = window.mathTooltips.config;
document.addEventListener('DOMContentLoaded', () => {
  window.MathJax.startup.promise.then(() => window.mathTooltips.attach());
});
