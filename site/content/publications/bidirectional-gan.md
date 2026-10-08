---
title: "Bidirectional generative adversarial representation learning for natural stimulus synthesis"
date: 2024-08-28
authors: "Johnny Reilly, John D. Goodwin, **Sihao Lu**, Andriy S. Kozlov"
journal: "Journal of Neurophysiology"
volume: "132: 1156–1169"
doi: "10.1152/jn.00421.2023"
card: computer
---

Thousands of species use vocal signals to communicate with one another. Vocalizations carry rich information, yet characterizing and analyzing these complex, high-dimensional signals is difficult and prone to human bias. Moreover, animal vocalizations are ethologically relevant stimuli whose representation by auditory neurons is an important subject of research in sensory neuroscience. A method that can efficiently generate naturalistic vocalization waveforms would offer an unlimited supply of stimuli with which to probe neuronal computations. Although unsupervised learning methods allow for the projection of vocalizations into low-dimensional latent spaces learned from the waveforms themselves, and generative modeling allows for the synthesis of novel vocalizations for use in downstream tasks, we are not aware of any model that combines these tasks to synthesize naturalistic vocalizations in the waveform domain for stimulus playback. In this paper, we demonstrate BiWaveGAN: a bidirectional generative adversarial network (GAN) capable of learning a latent representation of ultrasonic vocalizations (USVs) from mice. We show that BiWaveGAN can be used to generate, and interpolate between, realistic vocalization waveforms. We then use these synthesized stimuli along with natural USVs to probe the sensory input space of mouse auditory cortical neurons. We show that stimuli generated from our method evoke neuronal responses as effectively as real vocalizations, and produce receptive fields with the same predictive power. BiWaveGAN is not restricted to mouse USVs but can be used to synthesize naturalistic vocalizations of any animal species and interpolate between vocalizations of the same or different species, which could be useful for probing categorical boundaries in representations of ethologically relevant auditory signals.
