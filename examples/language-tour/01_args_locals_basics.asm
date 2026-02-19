; ZAX lowered .asm trace
; range: $0100..$0199 (end exclusive)

; func add_words begin
add_words:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
push DE                        ; 010B: D5
ex DE, HL                      ; 010C: EB
ld E, (IX + $0004)             ; 010D: DD 5E 04
ld D, (IX + $0005)             ; 0110: DD 56 05
ex DE, HL                      ; 0113: EB
pop DE                         ; 0114: D1
ld E, (IX + $0006)             ; 0115: DD 5E 06
ld D, (IX + $0007)             ; 0118: DD 56 07
add HL, DE                     ; 011B: 19
__zax_epilogue_0:
pop DE                         ; 011C: D1
pop BC                         ; 011D: C1
pop AF                         ; 011E: F1
ld SP, IX                      ; 011F: DD F9
pop IX                         ; 0121: DD E1
ret                            ; 0123: C9
; func add_words end
; func bump_byte begin
bump_byte:
push IX                        ; 0124: DD E5
ld IX, $0000                   ; 0126: DD 21 00 00
add IX, SP                     ; 012A: DD 39
ld HL, $0000                   ; 012C: 21 00 00
push HL                        ; 012F: E5
push AF                        ; 0130: F5
push BC                        ; 0131: C5
push DE                        ; 0132: D5
push DE                        ; 0133: D5
push IX                        ; 0134: DD E5
pop HL                         ; 0136: E1
ld DE, $0004                   ; 0137: 11 04 00
add HL, DE                     ; 013A: 19
push HL                        ; 013B: E5
pop DE                         ; 013C: D1
ld L, (hl)                     ; 013D: 6E
ld H, $0000                    ; 013E: 26 00
inc L                          ; 0140: 2C
push DE                        ; 0141: D5
ex DE, HL                      ; 0142: EB
ld (IX - $0002), E             ; 0143: DD 73 FE
ld (IX - $0001), D             ; 0146: DD 72 FF
ex DE, HL                      ; 0149: EB
pop DE                         ; 014A: D1
push DE                        ; 014B: D5
ex DE, HL                      ; 014C: EB
ld E, (IX - $0002)             ; 014D: DD 5E FE
ld D, (IX - $0001)             ; 0150: DD 56 FF
ex DE, HL                      ; 0153: EB
pop DE                         ; 0154: D1
__zax_epilogue_1:
pop DE                         ; 0155: D1
pop BC                         ; 0156: C1
pop AF                         ; 0157: F1
ld SP, IX                      ; 0158: DD F9
pop IX                         ; 015A: DD E1
ret                            ; 015C: C9
; func bump_byte end
; func main begin
main:
push IX                        ; 015D: DD E5
ld IX, $0000                   ; 015F: DD 21 00 00
add IX, SP                     ; 0163: DD 39
push HL                        ; 0165: E5
ld HL, $0000                   ; 0166: 21 00 00
ex (SP), HL                    ; 0169: E3
push AF                        ; 016A: F5
push BC                        ; 016B: C5
push DE                        ; 016C: D5
push HL                        ; 016D: E5
ld HL, $0014                   ; 016E: 21 14 00
push HL                        ; 0171: E5
ld HL, $000A                   ; 0172: 21 0A 00
push HL                        ; 0175: E5
call add_words                 ; 0176: CD 00 00
inc SP                         ; 0179: 33
inc SP                         ; 017A: 33
inc SP                         ; 017B: 33
inc SP                         ; 017C: 33
push DE                        ; 017D: D5
ex DE, HL                      ; 017E: EB
ld (IX - $0002), E             ; 017F: DD 73 FE
ld (IX - $0001), D             ; 0182: DD 72 FF
ex DE, HL                      ; 0185: EB
pop DE                         ; 0186: D1
ld HL, $0007                   ; 0187: 21 07 00
push HL                        ; 018A: E5
call bump_byte                 ; 018B: CD 00 00
inc SP                         ; 018E: 33
inc SP                         ; 018F: 33
__zax_epilogue_2:
pop HL                         ; 0190: E1
pop DE                         ; 0191: D1
pop BC                         ; 0192: C1
pop AF                         ; 0193: F1
ld SP, IX                      ; 0194: DD F9
pop IX                         ; 0196: DD E1
ret                            ; 0198: C9
; func main end

; symbols:
; label add_words = $0100
; label __zax_epilogue_0 = $011C
; label bump_byte = $0124
; label __zax_epilogue_1 = $0155
; label main = $015D
; label __zax_epilogue_2 = $0190
