; ZAX lowered .asm trace
; range: $0100..$0158 (end exclusive)

; func read_counter begin
read_counter:
push AF                        ; 0100: F5
push BC                        ; 0101: C5
push DE                        ; 0102: D5
ld HL, (counter)               ; 0103: 2A 00 00
__zax_epilogue_0:
pop DE                         ; 0106: D1
pop BC                         ; 0107: C1
pop AF                         ; 0108: F1
ret                            ; 0109: C9
; func read_counter end
; func write_counter begin
write_counter:
push IX                        ; 010A: DD E5
ld IX, $0000                   ; 010C: DD 21 00 00
add IX, SP                     ; 0110: DD 39
push HL                        ; 0112: E5
push AF                        ; 0113: F5
push BC                        ; 0114: C5
push DE                        ; 0115: D5
push HL                        ; 0116: E5
push DE                        ; 0117: D5
push IX                        ; 0118: DD E5
pop HL                         ; 011A: E1
ld DE, $0004                   ; 011B: 11 04 00
add HL, DE                     ; 011E: 19
push HL                        ; 011F: E5
pop DE                         ; 0120: D1
ld a, (hl) ; inc hl ; ld h, (hl) ; ld l, a ; 0121: 7E 23 66 6F
push HL                        ; 0125: E5
ld HL, counter                 ; 0126: 21 00 00
pop DE                         ; 0129: D1
ld (hl), e ; inc hl ; ld (hl), d ; 012A: 73 23 72
__zax_epilogue_1:
pop HL                         ; 012D: E1
pop DE                         ; 012E: D1
pop BC                         ; 012F: C1
pop AF                         ; 0130: F1
ld SP, IX                      ; 0131: DD F9
pop IX                         ; 0133: DD E1
ret                            ; 0135: C9
; func main begin
; func write_counter end
main:
push IX                        ; 0136: DD E5
ld IX, $0000                   ; 0138: DD 21 00 00
add IX, SP                     ; 013C: DD 39
push HL                        ; 013E: E5
push AF                        ; 013F: F5
push BC                        ; 0140: C5
push DE                        ; 0141: D5
push HL                        ; 0142: E5
ld HL, $007B                   ; 0143: 21 7B 00
push HL                        ; 0146: E5
call write_counter             ; 0147: CD 00 00
inc SP                         ; 014A: 33
inc SP                         ; 014B: 33
ld HL, (counter)               ; 014C: 2A 00 00
__zax_epilogue_2:
pop HL                         ; 014F: E1
pop DE                         ; 0150: D1
pop BC                         ; 0151: C1
pop AF                         ; 0152: F1
ld SP, IX                      ; 0153: DD F9
pop IX                         ; 0155: DD E1
ret                            ; 0157: C9
; func main end

; symbols:
; label read_counter = $0100
; label __zax_epilogue_0 = $0106
; label write_counter = $010A
; label __zax_epilogue_1 = $012D
; label main = $0136
; label __zax_epilogue_2 = $014F
; var counter = $0158
