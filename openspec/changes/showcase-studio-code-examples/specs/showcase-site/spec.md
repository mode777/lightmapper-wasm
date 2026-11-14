# Spec Delta

## MODIFIED Requirements

### Requirement: Scenario page provides 3D, Atlas and Code views

Each scenario page SHALL provide 3D, Atlas and Code views. The 3D view SHALL be
the default and SHALL support orbit, zoom and resizing. The Atlas view SHALL
show the baked lightmap and its UV chart layout. The Code view SHALL show the
scene's exact `lightmap-studio` bake input read-only.

#### Scenario: Default view
- **WHEN** a scenario page loads
- **THEN** the 3D view is selected and the baked scene is displayed

#### Scenario: Atlas view
- **WHEN** the visitor selects the Atlas view
- **THEN** the lightmap and the chart-colored UV layout for the current run are displayed

#### Scenario: Code view matches execution
- **WHEN** the visitor selects the Code view
- **THEN** the displayed scene input is the one the page passes to the studio bake, including its meshes, lighting, atlas size and options

#### Scenario: Switching views does not re-bake
- **WHEN** the visitor switches between 3D, Atlas and Code
- **THEN** the current lightmap and statistics remain unchanged

## ADDED Requirements

### Requirement: Code view presents the studio input example

The Code view SHALL precede the scene input with a fixed usage header that
creates a studio, bakes that input and reads the lightmap result, and SHALL
label both blocks. The copy action SHALL copy the header and the scene input
together.

#### Scenario: Header shows the studio calls
- **WHEN** the visitor selects the Code view
- **THEN** the header shows the studio entry call, the bake call and how the lightmap result is read, and the scene block is labeled with its file name

#### Scenario: Copy includes the header
- **WHEN** the visitor uses the copy action in the Code view
- **THEN** the copied text contains the fixed usage header followed by the scene input source

#### Scenario: Runtime controls do not rewrite the input
- **WHEN** the visitor changes the quality preset or bounce count and bakes again
- **THEN** the displayed scene input is unchanged and does not claim to contain the runtime override values

### Requirement: Gallery metadata matches the baked input

The gallery SHALL display each scene's atlas size and bounce count from the same
bake input the scenario page bakes, without a parallel metadata copy.

#### Scenario: Card matches its scenario
- **WHEN** the gallery renders a scene card
- **THEN** the displayed atlas size and bounce count equal that scene's bake input atlas size and bounce option

#### Scenario: Configured bounce total
- **WHEN** the gallery renders its summary facts
- **THEN** the configured-bounce total equals the sum of the scenes' bake input bounce options
