; ZAX lowered .asm trace
; range: $0100..$0185 (end exclusive)

; func add_words begin
add_words:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ex DE, HL                      ; 010B: EB
ld E, (IX + $0004)             ; 010C: DD 5E 04
ld D, (IX + $0005)             ; 010F: DD 56 05
ex DE, HL                      ; 0112: EB
ld E, (IX + $0006)             ; 0113: DD 5E 06
ld D, (IX + $0007)             ; 0116: DD 56 07
add HL, DE                     ; 0119: 19
pop DE                         ; 011A: D1
pop BC                         ; 011B: C1
pop AF                         ; 011C: F1
ld SP, IX                      ; 011D: DD F9
pop IX                         ; 011F: DD E1
ret                            ; 0121: C9
; func add_words end
; func bump_byte begin
bump_byte:
push IX                        ; 0122: DD E5
ld IX, $0000                   ; 0124: DD 21 00 00
add IX, SP                     ; 0128: DD 39
ld HL, $0000                   ; 012A: 21 00 00
push HL                        ; 012D: E5
push AF                        ; 012E: F5
push BC                        ; 012F: C5
push DE                        ; 0130: D5
push IX                        ; 0131: DD E5
pop HL                         ; 0133: E1
ld DE, $0004                   ; 0134: 11 04 00
add HL, DE                     ; 0137: 19
ld L, (hl)                     ; 0138: 6E
ld H, $0000                    ; 0139: 26 00
inc L                          ; 013B: 2C
ex DE, HL                      ; 013C: EB
ld (IX - $0002), E             ; 013D: DD 73 FE
ld (IX - $0001), D             ; 0140: DD 72 FF
ex DE, HL                      ; 0143: EB
ex DE, HL                      ; 0144: EB
ld E, (IX - $0002)             ; 0145: DD 5E FE
ld D, (IX - $0001)             ; 0148: DD 56 FF
ex DE, HL                      ; 014B: EB
pop DE                         ; 014C: D1
pop BC                         ; 014D: C1
pop AF                         ; 014E: F1
ld SP, IX                      ; 014F: DD F9
pop IX                         ; 0151: DD E1
ret                            ; 0153: C9
; func bump_byte end
; func main begin
main:
push IX                        ; 0154: DD E5
ld IX, $0000                   ; 0156: DD 21 00 00
add IX, SP                     ; 015A: DD 39
ld HL, $0000                   ; 015C: 21 00 00
push HL                        ; 015F: E5
ld HL, $0014                   ; 0160: 21 14 00
push HL                        ; 0163: E5
ld HL, $000A                   ; 0164: 21 0A 00
push HL                        ; 0167: E5
call add_words                 ; 0168: CD 00 00
inc SP                         ; 016B: 33
inc SP                         ; 016C: 33
inc SP                         ; 016D: 33
inc SP                         ; 016E: 33
ex DE, HL                      ; 016F: EB
ld (IX - $0002), E             ; 0170: DD 73 FE
ld (IX - $0001), D             ; 0173: DD 72 FF
ex DE, HL                      ; 0176: EB
ld HL, $0007                   ; 0177: 21 07 00
push HL                        ; 017A: E5
call bump_byte                 ; 017B: CD 00 00
inc SP                         ; 017E: 33
inc SP                         ; 017F: 33
ld SP, IX                      ; 0180: DD F9
pop IX                         ; 0182: DD E1
ret                            ; 0184: C9
; func main end

; symbols:
; label add_words = $0100
; label bump_byte = $0122
; label main = $0154
