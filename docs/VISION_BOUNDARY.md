# Vision boundary — DOM uses in the vision pipeline

Rule: vision chooses every click target. DOM may verify (Y) or correct (N);
corrected steps carry dom_assist + click-by-vision:N, never Y.

| DOM use | purpose | click target chosen by vision |
|---|---|---|
| probePoint elementFromPoint+value/checked | fill/click verify signal | Y |
| snapCheckToNativeInput rect+querySelector | snap toggle to native input | N |
| focus+Space on snapped input | toggle retry actuation | N |
| scrollY read | scroll verify signal | Y |
| body innerText length | state-change signal | Y |
| lowconf/crop re-detect select | resolve target from vision set | Y |
