; ZAX lowered .asm trace
; range: $0100..$01AA (end exclusive)

; func fib begin
fib:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
ld HL, $0000                   ; 0108: 21 00 00
push HL                        ; 010B: E5
ld HL, $0001                   ; 010C: 21 01 00
push HL                        ; 010F: E5
ld HL, $0000                   ; 0110: 21 00 00
push HL                        ; 0113: E5
ld HL, $0000                   ; 0114: 21 00 00
push HL                        ; 0117: E5
push AF                        ; 0118: F5
push BC                        ; 0119: C5
push DE                        ; 011A: D5
__zax_while_cond_1:
jp cc, __zax_while_end_2       ; 011B: CA 00 00
ex DE, HL                      ; 011E: EB
ld E, (IX - $0006)             ; 011F: DD 5E FA
ld D, (IX - $0005)             ; 0122: DD 56 FB
ex DE, HL                      ; 0125: EB
ld E, (IX + $0004)             ; 0126: DD 5E 04
ld D, (IX + $0005)             ; 0129: DD 56 05
xor A                          ; 012C: AF
sbc HL, DE                     ; 012D: ED 52
jp cc, __zax_if_else_3         ; 012F: C2 00 00
ex DE, HL                      ; 0132: EB
ld E, (IX - $0002)             ; 0133: DD 5E FE
ld D, (IX - $0001)             ; 0136: DD 56 FF
ex DE, HL                      ; 0139: EB
pop DE                         ; 013A: D1
pop BC                         ; 013B: C1
pop AF                         ; 013C: F1
ld SP, IX                      ; 013D: DD F9
pop IX                         ; 013F: DD E1
ret                            ; 0141: C9
__zax_if_else_3:
ex DE, HL                      ; 0142: EB
ld E, (IX - $0002)             ; 0143: DD 5E FE
ld D, (IX - $0001)             ; 0146: DD 56 FF
ex DE, HL                      ; 0149: EB
ld E, (IX - $0004)             ; 014A: DD 5E FC
ld D, (IX - $0003)             ; 014D: DD 56 FD
add HL, DE                     ; 0150: 19
ex DE, HL                      ; 0151: EB
ld (IX - $0008), E             ; 0152: DD 73 F8
ld (IX - $0007), D             ; 0155: DD 72 F9
ex DE, HL                      ; 0158: EB
ex DE, HL                      ; 0159: EB
ld E, (IX - $0004)             ; 015A: DD 5E FC
ld D, (IX - $0003)             ; 015D: DD 56 FD
ex DE, HL                      ; 0160: EB
ex DE, HL                      ; 0161: EB
ld (IX - $0002), E             ; 0162: DD 73 FE
ld (IX - $0001), D             ; 0165: DD 72 FF
ex DE, HL                      ; 0168: EB
ex DE, HL                      ; 0169: EB
ld E, (IX - $0008)             ; 016A: DD 5E F8
ld D, (IX - $0007)             ; 016D: DD 56 F9
ex DE, HL                      ; 0170: EB
ex DE, HL                      ; 0171: EB
ld (IX - $0004), E             ; 0172: DD 73 FC
ld (IX - $0003), D             ; 0175: DD 72 FD
ex DE, HL                      ; 0178: EB
ex DE, HL                      ; 0179: EB
ld E, (IX - $0006)             ; 017A: DD 5E FA
ld D, (IX - $0005)             ; 017D: DD 56 FB
ex DE, HL                      ; 0180: EB
inc HL                         ; 0181: 23
ex DE, HL                      ; 0182: EB
ld (IX - $0006), E             ; 0183: DD 73 FA
ld (IX - $0005), D             ; 0186: DD 72 FB
ex DE, HL                      ; 0189: EB
ld A, $0001                    ; 018A: 3E 01
or A                           ; 018C: B7
jp __zax_while_cond_1          ; 018D: C3 00 00
__zax_while_end_2:
ex DE, HL                      ; 0190: EB
ld E, (IX - $0002)             ; 0191: DD 5E FE
ld D, (IX - $0001)             ; 0194: DD 56 FF
ex DE, HL                      ; 0197: EB
pop DE                         ; 0198: D1
pop BC                         ; 0199: C1
pop AF                         ; 019A: F1
ld SP, IX                      ; 019B: DD F9
pop IX                         ; 019D: DD E1
ret                            ; 019F: C9
; func fib end
; func main begin
main:
ld HL, $000A                   ; 01A0: 21 0A 00
push HL                        ; 01A3: E5
call fib                       ; 01A4: CD 00 00
inc SP                         ; 01A7: 33
inc SP                         ; 01A8: 33
ret                            ; 01A9: C9
; func main end

; symbols:
; label fib = $0100
; label __zax_while_cond_1 = $011B
; label __zax_if_else_3 = $0142
; label __zax_while_end_2 = $0190
; label main = $01A0
