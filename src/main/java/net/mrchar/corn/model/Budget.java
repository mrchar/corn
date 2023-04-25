package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.ZonedDateTime;
import java.util.Set;
import java.util.UUID;

@Getter
@Entity
@Table(name = "budget")
@EntityListeners(AuditingEntityListener.class)
public class Budget {
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne
    @JoinColumn(name = "category_id")
    private Category category;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "budget_label")
    private Set<Label> labels;

    @ManyToOne
    @JoinColumn(name = "space_id")
    private Space space;

    @Column(name = "amount")
    private Double amount;

    @CreatedDate
    @Column(name = "created", columnDefinition = "TIMESTAMP")
    private ZonedDateTime created;

    @LastModifiedDate
    @Column(name = "modified", columnDefinition = "TIMESTAMP")
    private ZonedDateTime modified;
}
